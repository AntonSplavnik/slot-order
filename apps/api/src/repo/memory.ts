import {
  type Booked,
  CANCEL_REASONS,
  type CancelReason,
  type Menu,
  MenuSchema,
  ORDER_STATUSES,
  type OrderStatus,
  type SlotConfig,
  SlotConfigSchema,
  type SlotUsage,
} from "@slot-order/core";
import {
  InvalidStatusError,
  type NewOrder,
  type Order,
  type Repository,
  SlotFullError,
  type TransitionPatch,
} from "./types";

// The in-memory repository (docs/design.md §10.2): the route tests' database, held to the same contract
// test as the Supabase one. It mirrors the SQL of §5 rather than the tests:
// - every method is one transaction: the state is snapshotted first and restored when the method throws,
//   as Postgres rolls a failed function call back (a slot row created by a refused reservation, the
//   reservation of an order whose insert fails, a paid update whose re-reservation is full);
// - reserve_slot: a slot row is created on first use with the given capacity and keeps it; items < 1 are
//   `invalid_items`; `booked + n <= capacity` or SlotFullError;
// - the CHECKs, UNIQUEs and uuid type of the `orders`, `slots` and `stripe_events` columns (§5) are checked
//   on every write, with Postgres's wording;
// - jsonb columns (lines, receipt) go through JSON, as they do in Postgres;
// - status changes are conditional (`WHERE status IN …`), release_hold only from held, reserve_for_paid only
//   from expired, release_expired_holds strictly `hold_expires_at < now`;
// - what goes in and what comes out is a copy, so no caller can change the store but through a method.
// Ids come from a counter (gen_random_uuid's stand-in; nothing random is read). `createdAt` is the one
// timestamp read from the real clock, as `place_hold` takes it from the database's now() (§10.2).

type StoredOrder = { order: Order; seq: number };

type State = {
  slots: Map<number, SlotUsage>;
  orders: Map<string, StoredOrder>;
  stripeEvents: Map<string, { type: string; orderId: string | null }>;
};

/** Postgres's uuid input: 32 hex digits in the 8-4-4-4-12 form, any case. */
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** §5 orders.pickup_code CHECK. */
const PICKUP_CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** A column of type uuid: anything else fails as Postgres's cast does; uuids compare in any case. */
function uuid(text: string): string {
  if (!UUID_TEXT.test(text)) throw new Error(`invalid input syntax for type uuid: "${text}"`);
  return text.toLowerCase();
}

/** A jsonb column's round trip. */
function jsonb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function checkViolation(table: string, constraint: string): never {
  throw new Error(`new row for relation "${table}" violates check constraint "${constraint}"`);
}

function uniqueViolation(constraint: string): never {
  throw new Error(`duplicate key value violates unique constraint "${constraint}"`);
}

function isInteger(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min;
}

/** The CHECKs of §5 orders on a row about to be written. */
function checkOrderRow(order: Order): void {
  const nameLength = [...order.customerName].length; // char_length counts characters
  if (!ORDER_STATUSES.includes(order.status)) checkViolation("orders", "orders_status_check");
  if (nameLength < 1 || nameLength > 60) checkViolation("orders", "orders_customer_name_check");
  if (!Array.isArray(order.lines)) checkViolation("orders", "orders_lines_check");
  if (typeof order.receipt !== "object" || order.receipt === null || Array.isArray(order.receipt)) {
    checkViolation("orders", "orders_receipt_check");
  }
  if (!isInteger(order.itemCount, 1)) checkViolation("orders", "orders_item_count_check");
  if (!isInteger(order.totalCents, 0)) checkViolation("orders", "orders_total_cents_check");
  if (!PICKUP_CODE.test(order.pickupCode)) checkViolation("orders", "orders_pickup_code_check");
  if (order.cancelReason !== null && !CANCEL_REASONS.includes(order.cancelReason)) {
    checkViolation("orders", "orders_cancel_reason_check");
  }
  if (order.status === "held" && order.holdExpiresAt === null)
    checkViolation("orders", "orders_check");
}

export function createMemoryRepository(seed: { settings: SlotConfig; menu: Menu }): Repository {
  const settings = copy(seed.settings);
  const menu = copy(seed.menu);
  let state: State = { slots: new Map(), orders: new Map(), stripeEvents: new Map() };
  // Numbers the orders (their ids, and the insertion order behind equal createdAt); outside the state,
  // so like a Postgres sequence a failed transaction does not give its number back.
  let lastSeq = 0;

  /** One transaction: `work` sees and changes the state; if it throws, the state is as before. */
  function atomic<T>(work: () => T): T {
    const snapshot = copy(state);
    try {
      return work();
    } catch (error) {
      state = snapshot;
      throw error;
    }
  }

  function orderId(seq: number): string {
    return `00000000-0000-4000-8000-${seq.toString(16).padStart(12, "0")}`;
  }

  // The SQL functions of §5, inside a transaction.

  function reserveSlot(startsAt: Date, items: number, capacity: number): void {
    if (!isInteger(items, 1)) throw new Error("invalid_items");
    const key = startsAt.getTime();
    // INSERT … ON CONFLICT DO NOTHING: an existing row keeps its capacity (§3 Slot rows).
    if (!state.slots.has(key)) state.slots.set(key, { booked: 0, capacity });
    const slot = state.slots.get(key);
    // UPDATE … WHERE booked + n <= capacity; no row updated → slot_full.
    if (slot === undefined || slot.booked + items > slot.capacity) throw new SlotFullError();
    slot.booked += items;
  }

  function releaseSlot(startsAt: Date, items: number): void {
    if (!isInteger(items, 1)) throw new Error("invalid_items");
    const slot = state.slots.get(startsAt.getTime());
    if (slot === undefined) return;
    if (slot.booked - items < 0) checkViolation("slots", "slots_check");
    slot.booked -= items;
  }

  /** The UNIQUEs of §5 orders, against every other row. */
  function checkUnique(order: Order): void {
    for (const { order: other } of state.orders.values()) {
      if (other.id === order.id) continue;
      if (other.pickupCode === order.pickupCode) uniqueViolation("orders_pickup_code_key");
      if (order.stripeSessionId !== null && other.stripeSessionId === order.stripeSessionId) {
        uniqueViolation("orders_stripe_session_id_key");
      }
    }
  }

  function insertOrder(order: Order, seq: number): void {
    checkOrderRow(order);
    checkUnique(order);
    state.orders.set(order.id, { order, seq });
  }

  /** `UPDATE orders SET … WHERE id = $1 AND <where> RETURNING *`: the row after, or null. */
  function updateOrder(
    id: string,
    where: (order: Order) => boolean,
    set: (order: Order) => Partial<Order>,
  ): Order | null {
    const stored = state.orders.get(uuid(id));
    if (stored === undefined || !where(stored.order)) return null;
    const next: Order = { ...stored.order, ...set(stored.order) };
    checkOrderRow(next);
    checkUnique(next);
    stored.order = next;
    return next;
  }

  function releaseHold(
    id: string,
    status: "expired" | "cancelled",
    reason: CancelReason | null,
    now: Date,
  ): Order | null {
    if (status !== "expired" && status !== "cancelled") throw new InvalidStatusError();
    const released = updateOrder(
      id,
      (order) => order.status === "held",
      (order) => ({
        status,
        expiredAt: status === "expired" ? new Date(now) : order.expiredAt,
        cancelledAt: status === "cancelled" ? new Date(now) : order.cancelledAt,
        cancelReason: reason,
        holdExpiresAt: null,
      }),
    );
    if (released === null) return null;
    releaseSlot(released.slotStart, released.itemCount);
    return copy(released);
  }

  /** The orders in the order of `listOrders`: slotStart, then createdAt (ties: as inserted). */
  function byListOrder(a: StoredOrder, b: StoredOrder): number {
    return (
      a.order.slotStart.getTime() - b.order.slotStart.getTime() ||
      a.order.createdAt.getTime() - b.order.createdAt.getTime() ||
      a.seq - b.seq
    );
  }

  return {
    // Validated on every read, as src/db/rows.ts validates the database's rows.
    async getSettings() {
      return SlotConfigSchema.parse(settings);
    },

    async getMenu() {
      return MenuSchema.parse(menu);
    },

    async getSlotUsage(from, to): Promise<Booked> {
      const usage = new Map<number, SlotUsage>();
      const rows = [...state.slots].sort(([a], [b]) => a - b);
      for (const [start, slot] of rows) {
        if (start >= from.getTime() && start < to.getTime()) usage.set(start, { ...slot });
      }
      return usage;
    },

    async placeHold(order: NewOrder, capacity, holdExpiresAt) {
      return atomic(() => {
        reserveSlot(order.slotStart, order.itemCount, capacity);
        lastSeq += 1;
        const held: Order = {
          id: orderId(lastSeq),
          status: "held",
          slotStart: new Date(order.slotStart),
          customerName: order.customerName,
          lines: jsonb(order.lines),
          receipt: jsonb(order.receipt),
          itemCount: order.itemCount,
          totalCents: order.totalCents,
          promoCode: order.promoCode,
          pickupCode: order.pickupCode,
          stripeSessionId: null,
          checkoutUrl: null,
          stripePaymentIntentId: null,
          holdExpiresAt: new Date(holdExpiresAt),
          cancelReason: null,
          // The database's now() in place_hold: the one clock read outside the app's `now` (§10.2).
          createdAt: new Date(),
          paidAt: null,
          readyAt: null,
          pickedUpAt: null,
          expiredAt: null,
          cancelledAt: null,
        };
        insertOrder(held, lastSeq);
        return copy(held);
      });
    },

    async getOrder(id) {
      const stored = state.orders.get(uuid(id));
      return stored === undefined ? null : copy(stored.order);
    },

    async findOrderByPickupCode(code) {
      for (const { order } of state.orders.values()) {
        if (order.pickupCode === code) return copy(order);
      }
      return null;
    },

    async listOrders(from, to) {
      return [...state.orders.values()]
        .filter(({ order }) => {
          const start = order.slotStart.getTime();
          return start >= from.getTime() && start < to.getTime();
        })
        .sort(byListOrder)
        .map(({ order }) => copy(order));
    },

    async transition(id, from, to, at, patch: TransitionPatch = {}) {
      const statuses: readonly OrderStatus[] = typeof from === "string" ? [from] : from;
      const instant = new Date(at);
      // The `*_at` column of the target status (§8.2); `cancelled` is the refund case's `expired →
      // cancelled` (§9.3), which leaves the slot alone.
      const stamped: Partial<Order> =
        to === "paid"
          ? { paidAt: instant }
          : to === "ready"
            ? { readyAt: instant }
            : to === "picked_up"
              ? { pickedUpAt: instant }
              : { cancelledAt: instant };
      return atomic(() => {
        const moved = updateOrder(
          id,
          (order) => statuses.includes(order.status),
          () => ({
            status: to,
            ...stamped,
            ...(patch.stripePaymentIntentId === undefined
              ? {}
              : { stripePaymentIntentId: patch.stripePaymentIntentId }),
            ...(patch.cancelReason === undefined ? {} : { cancelReason: patch.cancelReason }),
          }),
        );
        return moved === null ? null : copy(moved);
      });
    },

    async releaseHold(id, status, reason, now) {
      return atomic(() => releaseHold(id, status, reason, now));
    },

    async releaseExpiredHolds(now) {
      return atomic(() => {
        const due = [...state.orders.values()]
          .filter(
            ({ order }) =>
              order.status === "held" &&
              order.holdExpiresAt !== null &&
              order.holdExpiresAt.getTime() < now.getTime(),
          )
          .sort(
            (a, b) =>
              (a.order.holdExpiresAt?.getTime() ?? 0) - (b.order.holdExpiresAt?.getTime() ?? 0) ||
              a.seq - b.seq,
          )
          .map(({ order }) => order.id);
        const released: Order[] = [];
        for (const id of due) {
          const order = releaseHold(id, "expired", null, now);
          if (order !== null) released.push(order);
        }
        return released;
      });
    },

    async reserveForPaid(id, capacity, paymentIntentId, now) {
      return atomic(() => {
        // The order first, then the slot: the same lock order as release_hold (§5).
        const paid = updateOrder(
          id,
          (order) => order.status === "expired",
          () => ({ status: "paid", paidAt: new Date(now), stripePaymentIntentId: paymentIntentId }),
        );
        if (paid === null) throw new InvalidStatusError();
        reserveSlot(paid.slotStart, paid.itemCount, capacity);
        return copy(paid);
      });
    },

    // `stripe_session_id` and `checkout_url` (§9.1), on an order in any status (§10.2).
    async setCheckout(id, sessionId, checkoutUrl) {
      atomic(() => {
        updateOrder(
          id,
          () => true,
          () => ({ stripeSessionId: sessionId, checkoutUrl }),
        );
      });
    },

    async recordStripeEvent(id, type, orderId) {
      return atomic(() => {
        const order = orderId === null ? null : uuid(orderId);
        if (state.stripeEvents.has(id)) return false; // INSERT … ON CONFLICT: the primary key
        state.stripeEvents.set(id, { type, orderId: order });
        return true;
      });
    },

    async deleteStripeEvent(id) {
      atomic(() => {
        state.stripeEvents.delete(id);
      });
    },
  };
}
