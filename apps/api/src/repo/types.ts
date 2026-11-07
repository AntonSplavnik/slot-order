import type {
  Booked,
  CancelReason,
  Menu,
  OrderStatus,
  PricedLine,
  Receipt,
  SlotConfig,
} from "@slot-order/core";

// The repository contract (docs/design.md §10.2): the only way routes reach the database. Two
// implementations, `createSupabaseRepository` and `createMemoryRepository`, held to one contract test.

/** An order as the domain sees it: camelCase, Dates, null for absent. */
export type Order = {
  id: string;
  status: OrderStatus;
  slotStart: Date;
  customerName: string;
  lines: PricedLine[];
  receipt: Receipt;
  itemCount: number;
  totalCents: number;
  promoCode: string | null;
  pickupCode: string;
  stripeSessionId: string | null;
  /** The Checkout Session's URL (§9.1), stored with the id by `setCheckout`. */
  checkoutUrl: string | null;
  stripePaymentIntentId: string | null;
  holdExpiresAt: Date | null;
  cancelReason: CancelReason | null;
  createdAt: Date;
  paidAt: Date | null;
  readyAt: Date | null;
  pickedUpAt: Date | null;
  expiredAt: Date | null;
  cancelledAt: Date | null;
};

/** What `placeHold` takes (§5 place_hold's payload). */
export type NewOrder = Pick<
  Order,
  | "slotStart"
  | "customerName"
  | "lines"
  | "receipt"
  | "itemCount"
  | "totalCents"
  | "promoCode"
  | "pickupCode"
>;

/** `reserve_slot` refused: the slot cannot take the items (§5). */
export class SlotFullError extends Error {
  constructor() {
    super("slot_full");
    this.name = "SlotFullError";
  }
}

/** A function was called for an order in the wrong status (§5 release_hold, reserve_for_paid). */
export class InvalidStatusError extends Error {
  constructor() {
    super("invalid_status");
    this.name = "InvalidStatusError";
  }
}

export type TransitionPatch = { stripePaymentIntentId?: string; cancelReason?: CancelReason };

export interface Repository {
  getSettings(): Promise<SlotConfig>;
  getMenu(): Promise<Menu>;
  /** The slot rows with `from <= starts_at < to`, keyed by `starts_at.getTime()`. */
  getSlotUsage(from: Date, to: Date): Promise<Booked>;
  /** `place_hold`: reserves the items and inserts the held order in one transaction; `SlotFullError`. */
  placeHold(order: NewOrder, capacity: number, holdExpiresAt: Date): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  findOrderByPickupCode(code: string): Promise<Order | null>;
  /** Orders with `from <= slotStart < to`, any status, by slotStart then createdAt. */
  listOrders(from: Date, to: Date): Promise<Order[]>;
  /**
   * The conditional update `WHERE status IN from`: sets `status = to` and the matching timestamp
   * (`paidAt`, `readyAt`, `pickedUpAt`, `cancelledAt`) to `at`, plus the patch; `null` when no row
   * matched. §8.2: `held → paid`, `paid → ready`, `paid | ready → picked_up`, and `expired → cancelled`
   * with a `cancelReason` (the refund case, §9.3; no slot change: `expired` released the items already).
   */
  transition(
    id: string,
    from: OrderStatus | OrderStatus[],
    to: "paid" | "ready" | "picked_up" | "cancelled",
    at: Date,
    patch?: TransitionPatch,
  ): Promise<Order | null>;
  /** `release_hold`: `null` when nothing was released. */
  releaseHold(
    id: string,
    status: "expired" | "cancelled",
    reason: CancelReason | null,
    now: Date,
  ): Promise<Order | null>;
  /** `release_expired_holds`. */
  releaseExpiredHolds(now: Date): Promise<Order[]>;
  /** `reserve_for_paid`: `SlotFullError` or `InvalidStatusError`. The intent may be unknown (§9.2). */
  reserveForPaid(
    id: string,
    capacity: number,
    paymentIntentId: string | null,
    now: Date,
  ): Promise<Order>;
  /** The Checkout Session's id and URL on the order (§9.1). */
  setCheckout(id: string, sessionId: string, checkoutUrl: string): Promise<void>;
  /** `INSERT INTO stripe_events`; `false` when the event id was already recorded (§9.2 step 3). */
  recordStripeEvent(id: string, type: string, orderId: string | null): Promise<boolean>;
  /** After a failed handling, so Stripe's retry is processed (§9.2 step 5). */
  deleteStripeEvent(id: string): Promise<void>;
}
