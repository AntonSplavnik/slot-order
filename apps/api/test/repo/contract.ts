import { type Cart, priceCart, type SlotUsage } from "@slot-order/core";
import { beforeEach, describe, expect, test } from "vitest";
import { line, seedMenu } from "../../../../packages/core/test/fixtures/menu";
import { seedConfig } from "../../../../packages/core/test/fixtures/slotConfigs";
import {
  InvalidStatusError,
  type NewOrder,
  type Order,
  type Repository,
  SlotFullError,
} from "../../src/repo/types";

// docs/design.md §10.2 (the repository contract), §5 (the SQL functions behind each method), §3 Slot
// rows, §8.2. One contract, two implementations: test/repo/memory.test.ts runs it in `pnpm test`,
// test/db/repository.test.ts against the local Supabase stack in `pnpm test:db` (orders, slots and
// stripe_events emptied before each test), so the in-memory fake cannot drift from the database.
// Each test opens a fresh repository; every instant is explicit, nothing reads the clock.

/** Mon 2026-11-09 12:30 Berlin, the slot most tests book. */
const S = new Date("2026-11-09T11:30:00Z");
/** A hold's expiry: placed at 12:00 Berlin, held for the seed's 10 minutes. */
const E = new Date("2026-11-09T11:10:00Z");
/** When something happens after the hold ran out. */
const T = new Date("2026-11-09T11:20:00Z");
const CAPACITY = 20;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function plusMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/** Burger Menu + Fries large ×2 with HAHN10: 3 items and a promo code, so every NewOrder field is set. */
const CART: Cart = {
  lines: [line("burger-menu"), line("fries", { options: ["fries-large"], quantity: 2 })],
  promoCode: "HAHN10",
};

/** `quantity` colas, no promo: exactly that many items. */
function colas(quantity: number): Cart {
  return { lines: [line("cola", { quantity })] };
}

/** A valid pickup code per test order (§5 CHECK: 8 Crockford characters): "TEST0001", "TEST0002", … */
function code(n: number): string {
  return `TEST${String(n).padStart(4, "0")}`;
}

/** What the API hands `placeHold` (§10): the cart priced with core. */
function newOrder(
  pickupCode: string,
  {
    cart = CART,
    slotStart = S,
    customerName = "Ada",
  }: { cart?: Cart; slotStart?: Date; customerName?: string } = {},
): NewOrder {
  const receipt = priceCart(seedMenu, cart);
  return {
    slotStart,
    customerName,
    lines: receipt.lines,
    receipt,
    itemCount: receipt.itemCount,
    totalCents: receipt.totalCents,
    promoCode: receipt.promoCode ?? null,
    pickupCode,
  };
}

/** Every field `placeHold` leaves empty (§5 orders). */
const EMPTY_FIELDS = {
  stripeSessionId: null,
  stripePaymentIntentId: null,
  cancelReason: null,
  paidAt: null,
  readyAt: null,
  pickedUpAt: null,
  expiredAt: null,
  cancelledAt: null,
};

export function describeRepositoryContract(name: string, open: () => Promise<Repository>): void {
  describe(`Repository contract: ${name}`, () => {
    let repo: Repository;

    beforeEach(async () => {
      repo = await open();
    });

    /** The slot row at `start`; undefined while it has none. */
    async function usageAt(start: Date): Promise<SlotUsage | undefined> {
      return (await repo.getSlotUsage(start, plusMinutes(start, 15))).get(start.getTime());
    }

    /** A held order of `cart` (3 items by default) at `slotStart`, capacity 20, expiring at E. */
    async function hold(
      n: number,
      options: { cart?: Cart; slotStart?: Date; customerName?: string } = {},
      holdExpiresAt = E,
    ): Promise<Order> {
      return repo.placeHold(newOrder(code(n), options), CAPACITY, holdExpiresAt);
    }

    async function current(id: string): Promise<Order | null> {
      return repo.getOrder(id);
    }

    describe("getSettings, getMenu", () => {
      test("getSettings() is the seed's slot config", async () => {
        expect(await repo.getSettings()).toEqual(seedConfig);
      });

      test("getMenu() is the seed menu, promo codes included", async () => {
        expect(await repo.getMenu()).toEqual(seedMenu);
      });
    });

    describe("getSlotUsage(from, to)", () => {
      test("is an empty Map while nothing is booked", async () => {
        const usage = await repo.getSlotUsage(
          new Date("2026-11-09T00:00:00Z"),
          new Date("2026-11-10T00:00:00Z"),
        );
        expect(usage).toEqual(new Map());
      });

      test("after a hold of 3 items at S with capacity 20: { S → { booked: 3, capacity: 20 } }", async () => {
        await hold(1);
        expect(await repo.getSlotUsage(S, plusMinutes(S, 15))).toEqual(
          new Map([[S.getTime(), { booked: 3, capacity: 20 }]]),
        );
      });

      test("from is inclusive, to exclusive", async () => {
        await hold(1);
        expect(await repo.getSlotUsage(S, new Date(S.getTime() + 1))).toEqual(
          new Map([[S.getTime(), { booked: 3, capacity: 20 }]]),
        );
        expect(await repo.getSlotUsage(plusMinutes(S, -15), S)).toEqual(new Map());
      });

      test("answers only the slots in the range", async () => {
        const next = plusMinutes(S, 15);
        await hold(1);
        await hold(2, { cart: colas(5), slotStart: next });
        expect(await repo.getSlotUsage(S, next)).toEqual(
          new Map([[S.getTime(), { booked: 3, capacity: 20 }]]),
        );
        expect(await repo.getSlotUsage(S, plusMinutes(S, 30))).toEqual(
          new Map([
            [S.getTime(), { booked: 3, capacity: 20 }],
            [next.getTime(), { booked: 5, capacity: 20 }],
          ]),
        );
      });
    });

    describe("placeHold(order, capacity, holdExpiresAt)", () => {
      test("returns the held order: a new UUID, createdAt, the expiry, every NewOrder field, nulls elsewhere", async () => {
        const input = newOrder(code(1));
        const order = await repo.placeHold(input, CAPACITY, E);
        expect(order).toEqual({
          ...input,
          ...EMPTY_FIELDS,
          id: expect.stringMatching(UUID),
          status: "held",
          holdExpiresAt: E,
          createdAt: expect.any(Date),
        });
        expect(input.promoCode).toBe("HAHN10");
        expect(await current(order.id)).toEqual(order);
      });

      test("refuses a hold that does not fit with SlotFullError: 3 + 18 > 20, booked stays 3", async () => {
        const first = await hold(1);
        await expect(hold(2, { cart: colas(18) })).rejects.toBeInstanceOf(SlotFullError);
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 20 });
        expect(await repo.listOrders(S, plusMinutes(S, 15))).toEqual([first]);
      });

      test("takes a hold that fills the slot exactly: 3 + 17 = 20", async () => {
        await hold(1);
        await hold(2, { cart: colas(17) });
        expect(await usageAt(S)).toEqual({ booked: 20, capacity: 20 });
      });

      test("a slot row keeps the capacity it was created with (§3 Slot rows)", async () => {
        await repo.placeHold(newOrder(code(1)), 5, E);
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 5 });
        await expect(repo.placeHold(newOrder(code(2)), CAPACITY, E)).rejects.toBeInstanceOf(
          SlotFullError,
        );
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 5 });
      });

      test("a pickup code that is taken: throws, and books nothing", async () => {
        const first = await hold(1);
        await expect(
          repo.placeHold(newOrder(code(1), { cart: colas(2) }), CAPACITY, E),
        ).rejects.toBeInstanceOf(Error);
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 20 });
        expect(await repo.listOrders(S, plusMinutes(S, 15))).toEqual([first]);
      });

      test("what it returns is a copy: changing it changes nothing stored", async () => {
        const order = await hold(1);
        const before = structuredClone(order);
        order.customerName = "Mallory";
        order.receipt.totalCents = 1;
        expect(await current(order.id)).toEqual(before);
      });
    });

    describe("getOrder, findOrderByPickupCode", () => {
      test("getOrder is null for an unknown UUID", async () => {
        expect(await repo.getOrder(UNKNOWN_ID)).toBeNull();
      });

      test("findOrderByPickupCode finds the order by its canonical code, null for any other", async () => {
        const order = await hold(1);
        await hold(2, { cart: colas(1) });
        expect(await repo.findOrderByPickupCode(code(1))).toEqual(order);
        expect(await repo.findOrderByPickupCode("ZZZZZZZZ")).toBeNull();
      });
    });

    describe("listOrders(from, to)", () => {
      test("the orders with from ≤ slotStart < to, in any status, by slotStart then createdAt", async () => {
        const later = await hold(1, { slotStart: plusMinutes(S, 15) });
        const first = await hold(2, { cart: colas(1) });
        const second = await hold(3, { cart: colas(1) });
        await hold(4, { slotStart: plusMinutes(S, 30) }); // at `to`: excluded
        await hold(5, { slotStart: plusMinutes(S, -15) }); // before `from`: excluded
        await repo.releaseHold(second.id, "expired", null, T);

        const listed = await repo.listOrders(S, plusMinutes(S, 30));
        expect(listed.map((order) => order.id)).toEqual([first.id, second.id, later.id]);
        expect(listed.map((order) => order.status)).toEqual(["held", "expired", "held"]);
      });

      test("is empty when no order is in the range", async () => {
        await hold(1);
        expect(await repo.listOrders(plusMinutes(S, 15), plusMinutes(S, 60))).toEqual([]);
      });
    });

    describe("transition(id, from, to, at, patch?)", () => {
      test("held → paid sets status, paidAt and the payment intent, and nothing else", async () => {
        const held = await hold(1);
        const paid = await repo.transition(held.id, "held", "paid", T, {
          stripePaymentIntentId: "pi_1",
        });
        expect(paid).toEqual({ ...held, status: "paid", paidAt: T, stripePaymentIntentId: "pi_1" });
        expect(await current(held.id)).toEqual(paid);
      });

      test("is null when the order is not in `from`, and changes nothing: held → paid twice", async () => {
        const held = await hold(1);
        const paid = await repo.transition(held.id, "held", "paid", T);
        expect(await repo.transition(held.id, "held", "paid", plusMinutes(T, 1))).toBeNull();
        expect(await current(held.id)).toEqual(paid);
      });

      test("is null for a held order asked to go paid → ready", async () => {
        const held = await hold(1);
        expect(await repo.transition(held.id, "paid", "ready", T)).toBeNull();
        expect(await current(held.id)).toEqual(held);
      });

      test("paid → ready sets readyAt", async () => {
        const held = await hold(1);
        const paid = await repo.transition(held.id, "held", "paid", T);
        const at = plusMinutes(T, 5);
        expect(await repo.transition(held.id, "paid", "ready", at)).toEqual({
          ...paid,
          status: "ready",
          readyAt: at,
        });
      });

      test("[paid, ready] → picked_up sets pickedUpAt, from ready and from paid", async () => {
        const fromReady = await hold(1);
        await repo.transition(fromReady.id, "held", "paid", T);
        const ready = await repo.transition(fromReady.id, "paid", "ready", plusMinutes(T, 5));
        const at = plusMinutes(T, 10);
        expect(await repo.transition(fromReady.id, ["paid", "ready"], "picked_up", at)).toEqual({
          ...ready,
          status: "picked_up",
          pickedUpAt: at,
        });

        const fromPaid = await hold(2, { cart: colas(1) });
        const paid = await repo.transition(fromPaid.id, "held", "paid", T);
        expect(await repo.transition(fromPaid.id, ["paid", "ready"], "picked_up", at)).toEqual({
          ...paid,
          status: "picked_up",
          pickedUpAt: at,
        });
      });

      test("is null for an unknown id", async () => {
        expect(await repo.transition(UNKNOWN_ID, "held", "paid", T)).toBeNull();
      });

      test("leaves the slot's booked alone", async () => {
        const held = await hold(1);
        await repo.transition(held.id, "held", "paid", T);
        await repo.transition(held.id, "paid", "ready", T);
        await repo.transition(held.id, "ready", "picked_up", T);
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 20 });
      });
    });

    describe("releaseHold(id, status, reason, now)", () => {
      test("expired: status, expiredAt = now, holdExpiresAt null, and the items go back to the slot", async () => {
        const held = await hold(1);
        const expired = await repo.releaseHold(held.id, "expired", null, T);
        expect(expired).toEqual({ ...held, status: "expired", expiredAt: T, holdExpiresAt: null });
        expect(await current(held.id)).toEqual(expired);
        // The slot keeps its row (§3 Slot rows): booked 0, not gone.
        expect(await usageAt(S)).toEqual({ booked: 0, capacity: 20 });
      });

      test("a second release is null and releases nothing twice", async () => {
        const held = await hold(1);
        await hold(2, { cart: colas(2) });
        await repo.releaseHold(held.id, "expired", null, T);
        expect(await repo.releaseHold(held.id, "expired", null, plusMinutes(T, 1))).toBeNull();
        expect(await usageAt(S)).toEqual({ booked: 2, capacity: 20 });
      });

      test("is null on a paid order, which stays paid with its items booked", async () => {
        const held = await hold(1);
        const paid = await repo.transition(held.id, "held", "paid", T);
        expect(await repo.releaseHold(held.id, "cancelled", "session_expired", T)).toBeNull();
        expect(await current(held.id)).toEqual(paid);
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 20 });
      });

      test("cancelled with stripe_failed: cancelReason and cancelledAt, items released", async () => {
        const held = await hold(1);
        expect(await repo.releaseHold(held.id, "cancelled", "stripe_failed", T)).toEqual({
          ...held,
          status: "cancelled",
          cancelReason: "stripe_failed",
          cancelledAt: T,
          holdExpiresAt: null,
        });
        expect(await usageAt(S)).toEqual({ booked: 0, capacity: 20 });
      });

      test("is null for an unknown id", async () => {
        expect(await repo.releaseHold(UNKNOWN_ID, "expired", null, T)).toBeNull();
      });
    });

    describe("releaseExpiredHolds(now)", () => {
      test("releases only holds with holdExpiresAt < now, returns them, and frees their items", async () => {
        const early = await hold(1, {}, E);
        const late = await hold(2, { cart: colas(2) }, plusMinutes(E, 2));
        const paid = await hold(3, { cart: colas(1) }, E);
        await repo.transition(paid.id, "held", "paid", plusMinutes(E, -5));
        const now = plusMinutes(E, 1);

        const released = await repo.releaseExpiredHolds(now);
        expect(released).toEqual([
          { ...early, status: "expired", expiredAt: now, holdExpiresAt: null },
        ]);
        expect((await current(late.id))?.status).toBe("held");
        expect((await current(paid.id))?.status).toBe("paid");
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 20 });
      });

      test("a hold expiring exactly now is not released (strictly <)", async () => {
        const held = await hold(1, {}, E);
        expect(await repo.releaseExpiredHolds(E)).toEqual([]);
        expect((await current(held.id))?.status).toBe("held");
      });

      test("is [] when nothing has expired, and on a second run", async () => {
        expect(await repo.releaseExpiredHolds(T)).toEqual([]);
        await hold(1, {}, E);
        expect(await repo.releaseExpiredHolds(T)).toHaveLength(1);
        expect(await repo.releaseExpiredHolds(T)).toEqual([]);
        expect(await usageAt(S)).toEqual({ booked: 0, capacity: 20 });
      });
    });

    describe("reserveForPaid(id, capacity, paymentIntentId, now)", () => {
      test("an expired order becomes paid: paidAt, the payment intent, and its items booked again", async () => {
        const held = await hold(1);
        const expired = await repo.releaseHold(held.id, "expired", null, T);
        const now = plusMinutes(T, 2);
        const paid = await repo.reserveForPaid(held.id, CAPACITY, "pi_2", now);
        expect(paid).toEqual({
          ...expired,
          status: "paid",
          paidAt: now,
          stripePaymentIntentId: "pi_2",
        });
        expect(await current(held.id)).toEqual(paid);
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 20 });
      });

      test("SlotFullError when the slot filled up meanwhile; the order stays expired", async () => {
        const held = await hold(1);
        const expired = await repo.releaseHold(held.id, "expired", null, T);
        await hold(2, { cart: colas(20) });
        await expect(
          repo.reserveForPaid(held.id, CAPACITY, "pi_2", plusMinutes(T, 2)),
        ).rejects.toBeInstanceOf(SlotFullError);
        expect(await current(held.id)).toEqual(expired);
        expect(await usageAt(S)).toEqual({ booked: 20, capacity: 20 });
      });

      test("InvalidStatusError for a held order, which stays held", async () => {
        const held = await hold(1);
        await expect(repo.reserveForPaid(held.id, CAPACITY, "pi_2", T)).rejects.toBeInstanceOf(
          InvalidStatusError,
        );
        expect(await current(held.id)).toEqual(held);
        expect(await usageAt(S)).toEqual({ booked: 3, capacity: 20 });
      });

      test("InvalidStatusError for a paid order and for an unknown id (§5: only from expired)", async () => {
        const held = await hold(1);
        await repo.transition(held.id, "held", "paid", T);
        await expect(repo.reserveForPaid(held.id, CAPACITY, "pi_2", T)).rejects.toBeInstanceOf(
          InvalidStatusError,
        );
        await expect(repo.reserveForPaid(UNKNOWN_ID, CAPACITY, "pi_2", T)).rejects.toBeInstanceOf(
          InvalidStatusError,
        );
      });
    });

    describe("setCheckout(id, sessionId, checkoutUrl) (M5)", () => {
      test("stores the session id on the held order", async () => {
        const held = await hold(1);
        await repo.setCheckout(held.id, "cs_1", "https://checkout.stripe.com/c/pay/cs_1");
        // The URL goes into M5's column; until then the contract pins only the session id.
        expect(await current(held.id)).toMatchObject({ status: "held", stripeSessionId: "cs_1" });
      });
    });

    describe("recordStripeEvent, deleteStripeEvent (M5)", () => {
      test("records an event id once: true, then false; after deleting it, true again", async () => {
        const held = await hold(1);
        expect(await repo.recordStripeEvent("evt_1", "checkout.session.completed", held.id)).toBe(
          true,
        );
        expect(await repo.recordStripeEvent("evt_1", "checkout.session.completed", held.id)).toBe(
          false,
        );
        await repo.deleteStripeEvent("evt_1");
        expect(await repo.recordStripeEvent("evt_1", "checkout.session.completed", held.id)).toBe(
          true,
        );
      });

      test("an event without an order is recorded too", async () => {
        expect(await repo.recordStripeEvent("evt_2", "charge.refunded", null)).toBe(true);
        expect(await repo.recordStripeEvent("evt_2", "charge.refunded", null)).toBe(false);
      });
    });
  });
}
