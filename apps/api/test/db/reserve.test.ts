import type { ReservedSql } from "postgres";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  bookedIn,
  closeDb,
  expectSqlState,
  OTHER_SLOT,
  only,
  reserveSlot,
  resetOrders,
  SLOT,
  type SlotRow,
  service,
  slotRow,
  sql,
} from "./helpers";

// docs/design.md §5 `reserve_slot` and `release_slot`, §3 "Slot rows" and "No overbooking": the row is
// created lazily with the caller's capacity, the conditional UPDATE never books past it, and concurrent
// callers lose with `slot_full` instead of overbooking, both through the driver and through PostgREST.

beforeEach(resetOrders);
afterAll(closeDb);

/** Runs `query` once on each of `n` connections of its own, all at the same time, so the calls race. */
async function race<T>(n: number, query: (db: ReservedSql) => Promise<T>) {
  const connections = await Promise.all(Array.from({ length: n }, () => sql.reserve()));
  try {
    const backends = await Promise.all(
      connections.map(async (db) =>
        only(await db<{ pid: number }[]>`select pg_backend_pid() as pid`),
      ),
    );
    expect(new Set(backends.map((backend) => backend.pid)).size).toBe(n);
    return await Promise.allSettled(connections.map(query));
  } finally {
    for (const db of connections) db.release();
  }
}

/** How many calls succeeded, and the messages of those that failed. */
function outcome(results: PromiseSettledResult<unknown>[]) {
  return {
    fulfilled: results.filter((result) => result.status === "fulfilled").length,
    rejected: results.flatMap((result) =>
      result.status === "rejected" ? [String(result.reason?.message)] : [],
    ),
  };
}

const slotFull = { message: "slot_full" };

describe("reserve_slot (§5)", () => {
  test("the first call creates the slot's row with the given capacity and books the items", async () => {
    expect(await reserveSlot(SLOT, 3, 20)).toEqual({ starts_at: SLOT, capacity: 20, booked: 3 });
    expect(await slotRow(SLOT)).toEqual({ starts_at: SLOT, capacity: 20, booked: 3 });
  });

  test("capacity 5: 3 items fit, 3 more are slot_full, and booked stays 3", async () => {
    expect(await reserveSlot(SLOT, 3, 5)).toEqual({ starts_at: SLOT, capacity: 5, booked: 3 });
    await expect(reserveSlot(SLOT, 3, 5)).rejects.toMatchObject(slotFull);
    expect(await slotRow(SLOT)).toEqual({ starts_at: SLOT, capacity: 5, booked: 3 });
  });

  test("an existing row keeps its capacity: p_capacity 50 does not make room for 20 more", async () => {
    await reserveSlot(SLOT, 1, 20);
    await expect(reserveSlot(SLOT, 20, 50)).rejects.toMatchObject(slotFull);
    expect(await slotRow(SLOT)).toEqual({ starts_at: SLOT, capacity: 20, booked: 1 });
    expect(await reserveSlot(SLOT, 19, 50)).toEqual({ starts_at: SLOT, capacity: 20, booked: 20 });
  });

  test.each([0, -1])("p_items %i is invalid_items, and no row is created", async (items) => {
    await expect(reserveSlot(SLOT, items, 20)).rejects.toMatchObject({ message: "invalid_items" });
    expect(await slotRow(SLOT)).toBeUndefined();
  });
});

describe("50 parallel callers (§3 No overbooking, §13 Database)", () => {
  test("postgres, 50 connections, capacity 1: exactly 1 wins, 49 are slot_full, booked = 1", async () => {
    const results = await race(
      50,
      (db) => db<SlotRow[]>`select * from reserve_slot(${SLOT}, 1, 1)`,
    );
    expect(outcome(results)).toEqual({ fulfilled: 1, rejected: Array(49).fill("slot_full") });
    const winner = results.find((result) => result.status === "fulfilled");
    expect(winner?.value).toEqual([{ starts_at: SLOT, capacity: 1, booked: 1 }]);
    expect(await bookedIn(SLOT)).toBe(1);
  });

  test("supabase-js, 50 rpc calls, capacity 1: exactly 1 gets data, 49 are slot_full, booked = 1", async () => {
    const calls = await Promise.all(
      Array.from({ length: 50 }, () =>
        service.rpc("reserve_slot", {
          p_starts_at: OTHER_SLOT.toISOString(),
          p_items: 1,
          p_capacity: 1,
        }),
      ),
    );
    const winners = calls.filter((call) => call.error === null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.data).toMatchObject({ capacity: 1, booked: 1 });
    expect(calls.flatMap((call) => (call.error === null ? [] : [call.error.message]))).toEqual(
      Array(49).fill(expect.stringContaining("slot_full")),
    );
    expect(await bookedIn(OTHER_SLOT)).toBe(1);
  });

  test("postgres, 50 connections, capacity 20: exactly 20 win, 30 are slot_full, booked = 20", async () => {
    const results = await race(
      50,
      (db) => db<SlotRow[]>`select * from reserve_slot(${SLOT}, 1, 20)`,
    );
    expect(outcome(results)).toEqual({ fulfilled: 20, rejected: Array(30).fill("slot_full") });
    expect(await slotRow(SLOT)).toEqual({ starts_at: SLOT, capacity: 20, booked: 20 });
  });
});

describe("release_slot (§5)", () => {
  test("gives items back, and never below 0 (the CHECK on booked: 23514)", async () => {
    await reserveSlot(SLOT, 3, 20);
    expect([...(await sql`select * from release_slot(${SLOT}, 2)`)]).toEqual([
      { starts_at: SLOT, capacity: 20, booked: 1 },
    ]);
    await expectSqlState(sql`select * from release_slot(${SLOT}, 2)`, "23514");
    expect(await bookedIn(SLOT)).toBe(1);
  });
});

describe("through supabase-js, as the Worker calls it (§5 SQL functions)", () => {
  test("the row arrives as JSON, and slot_full as { message: 'slot_full', code: 'P0001' }", async () => {
    const call = () =>
      service.rpc("reserve_slot", { p_starts_at: SLOT.toISOString(), p_items: 1, p_capacity: 1 });
    const first = await call();
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ capacity: 1, booked: 1 });
    expect(new Date(first.data.starts_at)).toEqual(SLOT);
    const second = await call();
    expect(second.data).toBeNull();
    expect(second.error).toMatchObject({ message: "slot_full", code: "P0001" });
  });
});
