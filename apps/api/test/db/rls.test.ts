import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  anon,
  closeDb,
  HOLD_EXPIRY,
  holdPayload,
  OTHER_SLOT,
  placeHold,
  plusMinutes,
  resetOrders,
  SLOT,
  service,
  sql,
  TABLES,
} from "./helpers";

// docs/design.md §3 "Trust boundary", §5 Privileges: RLS is on for every table with no policies, so the
// anon key reads nothing and writes nothing, and EXECUTE on every function is revoked from public, anon and
// authenticated; the service role, which the Worker uses, reads every table and calls every function.

const T = new Date("2026-11-09T10:15:00Z");
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

beforeEach(async () => {
  // A row in every table: the seed fills the menu tables and settings, a hold fills slots and orders.
  await resetOrders();
  const order = await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
  await sql`
    insert into stripe_events (id, type, order_id, received_at)
    values ('evt_test_rls', 'checkout.session.completed', ${order.id}, ${HOLD_EXPIRY})`;
});
afterAll(closeDb);

/** What the anon calls must leave alone. */
async function state() {
  return {
    slots: [...(await sql`select * from slots order by starts_at`)],
    orders: [...(await sql`select * from orders order by id`)],
  };
}

describe("tables", () => {
  test.each(TABLES)("the service role reads the rows of %s", async (table) => {
    const { data, error } = await service.from(table).select("*");
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  test.each(TABLES)("the anon key reads %s as empty, without an error", async (table) => {
    const { data, error } = await anon.from(table).select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("the anon key cannot insert an order", async () => {
    const before = await state();
    const { error } = await anon
      .from("orders")
      .insert({ ...holdPayload("AAAA0002"), status: "held", hold_expires_at: HOLD_EXPIRY });
    expect(error).toMatchObject({ code: "42501" });
    expect(await state()).toEqual(before);
  });
});

describe("functions", () => {
  // Every function of §5, with arguments that would succeed for the service role (or do nothing).
  const calls: [name: string, args: Record<string, unknown>][] = [
    ["reserve_slot", { p_starts_at: OTHER_SLOT, p_items: 1, p_capacity: 20 }],
    ["release_slot", { p_starts_at: SLOT, p_items: 1 }],
    [
      "place_hold",
      { p_order: holdPayload("AAAA0003"), p_capacity: 20, p_hold_expires_at: HOLD_EXPIRY },
    ],
    ["release_hold", { p_order_id: UNKNOWN_ID, p_status: "expired", p_reason: null, p_now: T }],
    ["release_expired_holds", { p_now: T }],
    [
      "reserve_for_paid",
      { p_order_id: UNKNOWN_ID, p_capacity: 20, p_payment_intent_id: "pi_test", p_now: T },
    ],
    ["slot_booked_mismatches", {}],
  ];

  test.each(calls)(
    "the anon key cannot call %s, and the call changes nothing",
    async (name, args) => {
      const before = await state();
      const { data, error } = await anon.rpc(name, args);
      expect(data).toBeNull();
      const refused = error?.code === "42501" || /permission denied/.test(error?.message ?? "");
      expect(refused, `refused with ${JSON.stringify(error)}`).toBe(true);
      expect(await state()).toEqual(before);
    },
  );

  // A sample of the same functions, for the role the Worker uses.
  const serviceCalls: [name: string, args: Record<string, unknown>][] = [
    [
      "place_hold",
      { p_order: holdPayload("AAAA0004"), p_capacity: 20, p_hold_expires_at: HOLD_EXPIRY },
    ],
    ["release_expired_holds", { p_now: plusMinutes(HOLD_EXPIRY, -1) }],
    ["slot_booked_mismatches", {}],
    ["reserve_slot", { p_starts_at: OTHER_SLOT, p_items: 1, p_capacity: 20 }],
  ];

  test.each(serviceCalls)("the service role can call %s", async (name, args) => {
    const { error } = await service.rpc(name, args);
    expect(error).toBeNull();
  });
});
