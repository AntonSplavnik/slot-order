import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  bookedIn,
  closeDb,
  colas,
  expectNoMismatches,
  HOLD_EXPIRY,
  holdPayload,
  type OrderRow,
  OTHER_SLOT,
  only,
  orderRow,
  pickupCodes,
  placeHold,
  plusMinutes,
  resetOrders,
  SLOT,
  service,
  sql,
  UUID,
} from "./helpers";

// docs/design.md §5 `place_hold`, `release_hold`, `release_expired_holds`, `reserve_for_paid`; §3 "Holds";
// §8.2 (the transitions they make and the invariant, checked after every test); §8.4 (the second chance of
// an expired order that was paid). Every instant is explicit.

beforeEach(resetOrders);
afterEach(expectNoMismatches);
afterAll(closeDb);

/** When the cron or the webhook releases, after HOLD_EXPIRY. */
const T = new Date("2026-11-09T10:15:00Z");
/** When the late payment's webhook arrives. */
const PAID_AT = plusMinutes(T, 2);
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const slotFull = { message: "slot_full" };
const invalidStatus = { message: "invalid_status" };

// SPEC: §5 says release_hold returns NULL when nothing was released. `select *` of a NULL composite is one
// row of nulls, and PostgREST sends it as an object whose fields are all null, not as `null`; the M4
// repository has to test the id. Here a row without an id is read as null.
async function releaseHold(id: string, status: string, reason: string | null, now: Date) {
  const row = only(
    await sql<OrderRow[]>`select * from release_hold(${id}, ${status}, ${reason}, ${now})`,
  );
  return row.id === null ? null : row;
}

async function releaseExpiredHolds(now: Date): Promise<OrderRow[]> {
  return [...(await sql<OrderRow[]>`select * from release_expired_holds(${now})`)];
}

async function reserveForPaid(id: string, capacity: number, paymentIntentId: string, now: Date) {
  return only(
    await sql<OrderRow[]>`
      select * from reserve_for_paid(${id}, ${capacity}, ${paymentIntentId}, ${now})`,
  );
}

describe("place_hold (§5, §3 No overbooking)", () => {
  test("returns the held order with the payload stored, and books its items in the slot", async () => {
    const payload = holdPayload("AAAA0001");
    const order = await placeHold(payload, 20, HOLD_EXPIRY);
    expect(order).toMatchObject({
      status: "held",
      hold_expires_at: HOLD_EXPIRY,
      slot_start: SLOT,
      customer_name: "Mia",
      lines: payload.lines,
      receipt: payload.receipt,
      item_count: 3,
      total_cents: payload.total_cents,
      promo_code: "HAHN10",
      pickup_code: "AAAA0001",
      paid_at: null,
      expired_at: null,
      cancelled_at: null,
      cancel_reason: null,
    });
    expect(order.id).toMatch(UUID);
    expect(await orderRow(order.id)).toEqual(order);
    expect(await bookedIn(SLOT)).toBe(3);
  });

  test("a payload without customer_name fails, and its reservation is rolled back", async () => {
    await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
    const { customer_name: _, ...nameless } = holdPayload("AAAA0002", { cart: colas(2) });
    await expect(placeHold(nameless, 20, HOLD_EXPIRY)).rejects.toThrow();
    expect(await pickupCodes()).toEqual(["AAAA0001"]);
    expect(await bookedIn(SLOT)).toBe(3);
  });

  test("a full slot is slot_full, and no order is written", async () => {
    // Another order takes the whole slot: a 20-item hold rather than a bare reserve_slot(S, 20, 20), so
    // the invariant that afterEach checks still holds.
    await placeHold(holdPayload("AAAA0001", { cart: colas(20) }), 20, HOLD_EXPIRY);
    await expect(placeHold(holdPayload("AAAA0002"), 20, HOLD_EXPIRY)).rejects.toMatchObject(
      slotFull,
    );
    expect(await pickupCodes()).toEqual(["AAAA0001"]);
    expect(await bookedIn(SLOT)).toBe(20);
  });
});

describe("release_hold (§5, §8.2 held → expired | cancelled)", () => {
  test("'expired': expired_at = p_now, hold_expires_at cleared, its items released", async () => {
    const held = await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
    const released = await releaseHold(held.id, "expired", null, T);
    expect(released).toMatchObject({
      id: held.id,
      status: "expired",
      expired_at: T,
      hold_expires_at: null,
      cancel_reason: null,
    });
    expect(await orderRow(held.id)).toEqual(released);
    expect(await bookedIn(SLOT)).toBe(0);
  });

  test("a second call returns null and releases nothing more", async () => {
    const first = await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
    await placeHold(holdPayload("AAAA0002", { cart: colas(2) }), 20, HOLD_EXPIRY);
    await releaseHold(first.id, "expired", null, T);
    expect(await bookedIn(SLOT)).toBe(2);
    expect(await releaseHold(first.id, "expired", null, plusMinutes(T, 1))).toBeNull();
    expect(await orderRow(first.id)).toMatchObject({ status: "expired", expired_at: T });
    expect(await bookedIn(SLOT)).toBe(2);
  });

  test("'cancelled' with a reason: cancelled_at = p_now, cancel_reason stored, items released", async () => {
    const held = await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
    const released = await releaseHold(held.id, "cancelled", "stripe_failed", T);
    expect(released).toMatchObject({
      id: held.id,
      status: "cancelled",
      cancelled_at: T,
      cancel_reason: "stripe_failed",
      hold_expires_at: null,
    });
    expect(await bookedIn(SLOT)).toBe(0);
  });

  test("p_status 'paid' is invalid_status, and the order stays held", async () => {
    const held = await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
    await expect(releaseHold(held.id, "paid", null, T)).rejects.toMatchObject(invalidStatus);
    expect(await orderRow(held.id)).toEqual(held);
    expect(await bookedIn(SLOT)).toBe(3);
  });

  test("an unknown id returns null", async () => {
    expect(await releaseHold(UNKNOWN_ID, "expired", null, T)).toBeNull();
  });
});

describe("release_expired_holds (§5, §3 Holds)", () => {
  test("releases exactly the holds that expired before p_now", async () => {
    const expired = await placeHold(holdPayload("AAAA0001"), 20, plusMinutes(T, -1));
    const live = await placeHold(
      holdPayload("AAAA0002", { cart: colas(2) }),
      20,
      plusMinutes(T, 1),
    );
    const released = await releaseExpiredHolds(T);
    expect(released).toHaveLength(1);
    expect(released[0]).toMatchObject({
      id: expired.id,
      status: "expired",
      expired_at: T,
      hold_expires_at: null,
    });
    expect(await orderRow(live.id)).toEqual(live);
    expect(await bookedIn(SLOT)).toBe(2);
  });

  test("a hold expiring exactly at p_now is not released yet (hold_expires_at < p_now)", async () => {
    const held = await placeHold(holdPayload("AAAA0001"), 20, T);
    expect(await releaseExpiredHolds(T)).toEqual([]);
    expect(await orderRow(held.id)).toEqual(held);
  });

  test("with nothing expired it returns [] and changes nothing", async () => {
    const live = await placeHold(holdPayload("AAAA0001"), 20, plusMinutes(T, 1));
    expect(await releaseExpiredHolds(T)).toEqual([]);
    expect(await orderRow(live.id)).toEqual(live);
    expect(await bookedIn(SLOT)).toBe(3);
  });

  test("through supabase-js the released orders arrive as an array", async () => {
    const expired = await placeHold(holdPayload("AAAA0001"), 20, plusMinutes(T, -1));
    await placeHold(holdPayload("AAAA0002", { cart: colas(2) }), 20, plusMinutes(T, 1));
    const { data, error } = await service.rpc("release_expired_holds", { p_now: T.toISOString() });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: expired.id, status: "expired", hold_expires_at: null });
    expect(new Date(data[0].expired_at)).toEqual(T);
    expect(await bookedIn(SLOT)).toBe(2);
  });
});

describe("reserve_for_paid (§5, §8.4 the expired order that was paid)", () => {
  test("an expired order: paid, paid_at = p_now, the payment intent stored, its items booked again", async () => {
    const held = await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
    await releaseHold(held.id, "expired", null, T);
    expect(await bookedIn(SLOT)).toBe(0);
    const paid = await reserveForPaid(held.id, 20, "pi_test", PAID_AT);
    expect(paid).toMatchObject({
      id: held.id,
      status: "paid",
      paid_at: PAID_AT,
      stripe_payment_intent_id: "pi_test",
    });
    expect(await orderRow(held.id)).toEqual(paid);
    expect(await bookedIn(SLOT)).toBe(3);
  });

  test("the slot filled up meanwhile: slot_full, the order stays expired, booked unchanged", async () => {
    const held = await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
    await releaseHold(held.id, "expired", null, T);
    // Another order takes the whole slot (a hold, not a bare reserve_slot: see place_hold above).
    await placeHold(holdPayload("AAAA0002", { cart: colas(20) }), 20, plusMinutes(T, 10));
    await expect(reserveForPaid(held.id, 20, "pi_test", PAID_AT)).rejects.toMatchObject(slotFull);
    expect(await orderRow(held.id)).toMatchObject({
      status: "expired",
      paid_at: null,
      stripe_payment_intent_id: null,
    });
    expect(await bookedIn(SLOT)).toBe(20);
  });

  test("a held order is invalid_status", async () => {
    const held = await placeHold(holdPayload("AAAA0001"), 20, HOLD_EXPIRY);
    await expect(reserveForPaid(held.id, 20, "pi_test", PAID_AT)).rejects.toMatchObject(
      invalidStatus,
    );
    expect(await orderRow(held.id)).toEqual(held);
    expect(await bookedIn(SLOT)).toBe(3);
  });
});

describe("the invariant (§8.2): booked = Σ item_count of held, paid, ready, picked-up orders", () => {
  test("holds through every step: placed, cancelled, expired by the cron, paid late", async () => {
    const cancelled = await placeHold(holdPayload("AAAA0001"), 20, plusMinutes(T, 5));
    const expired = await placeHold(
      holdPayload("AAAA0002", { cart: colas(2) }),
      20,
      plusMinutes(T, -1),
    );
    const paidLate = await placeHold(
      holdPayload("AAAA0003", { cart: colas(1), slotStart: OTHER_SLOT }),
      20,
      plusMinutes(T, -1),
    );
    await expectNoMismatches();
    expect([await bookedIn(SLOT), await bookedIn(OTHER_SLOT)]).toEqual([5, 1]);

    await releaseHold(cancelled.id, "cancelled", "stripe_failed", T);
    await expectNoMismatches();

    const released = await releaseExpiredHolds(T);
    expect(released.map((order) => order.id).sort()).toEqual([expired.id, paidLate.id].sort());
    await expectNoMismatches();
    expect([await bookedIn(SLOT), await bookedIn(OTHER_SLOT)]).toEqual([0, 0]);

    await reserveForPaid(paidLate.id, 20, "pi_test", PAID_AT);
    await expectNoMismatches();
    expect([await bookedIn(SLOT), await bookedIn(OTHER_SLOT)]).toEqual([0, 1]);

    const statuses = await sql<{ pickup_code: string; status: string }[]>`
      select pickup_code, status from orders order by pickup_code`;
    expect([...statuses]).toEqual([
      { pickup_code: "AAAA0001", status: "cancelled" },
      { pickup_code: "AAAA0002", status: "expired" },
      { pickup_code: "AAAA0003", status: "paid" },
    ]);
  });
});
