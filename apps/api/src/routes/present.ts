import {
  type OrderStatus,
  type OrderSummary,
  type SlotConfig,
  type StaffOrder,
  slotLabel,
} from "@slot-order/core";
import type { Order } from "../repo/types";

// The two views of an order (docs/design.md §10.1), each built in one place: what the customer sees, and
// what staff see. Instants as ISO strings in UTC.

/** The statuses whose summary shows the pickup code (§3 Pickup code: only once the order is paid). */
const CODE_VISIBLE: ReadonlySet<OrderStatus> = new Set(["paid", "ready", "picked_up"]);

function iso(instant: Date): string {
  return instant.toISOString();
}

/** `{ key: iso(instant) }` once the instant exists, else nothing. */
function stamp<K extends string>(key: K, instant: Date | null): Partial<Record<K, string>> {
  return instant === null ? {} : ({ [key]: iso(instant) } as Record<K, string>);
}

/**
 * `OrderSummary` (§10.1): `pickupCode` only in paid, ready and picked_up; `checkoutUrl` and
 * `holdExpiresAt` only in held; `cancelReason` only in cancelled; each timestamp once it exists.
 */
export function orderSummary(order: Order, config: SlotConfig): OrderSummary {
  return {
    id: order.id,
    status: order.status,
    slotStart: iso(order.slotStart),
    slotLabel: slotLabel(config, order.slotStart),
    customerName: order.customerName,
    itemCount: order.itemCount,
    receipt: order.receipt,
    createdAt: iso(order.createdAt),
    ...(CODE_VISIBLE.has(order.status) ? { pickupCode: order.pickupCode } : {}),
    // The Checkout Session's URL (§9.1): null until `setCheckout` stored one.
    ...(order.status === "held"
      ? { checkoutUrl: order.checkoutUrl, ...stamp("holdExpiresAt", order.holdExpiresAt) }
      : {}),
    ...(order.status === "cancelled" && order.cancelReason !== null
      ? { cancelReason: order.cancelReason }
      : {}),
    ...stamp("paidAt", order.paidAt),
    ...stamp("readyAt", order.readyAt),
    ...stamp("pickedUpAt", order.pickedUpAt),
    ...stamp("expiredAt", order.expiredAt),
    ...stamp("cancelledAt", order.cancelledAt),
  };
}

/** `StaffOrder` (§10.1): an order in paid, ready or picked_up, which always has `paidAt`. */
export function staffOrder(order: Order, config: SlotConfig): StaffOrder {
  if (order.paidAt === null) {
    throw new Error(`order ${order.id} in status ${order.status} has no paidAt`);
  }
  return {
    id: order.id,
    status: order.status,
    pickupCode: order.pickupCode,
    customerName: order.customerName,
    slotStart: iso(order.slotStart),
    slotLabel: slotLabel(config, order.slotStart),
    lines: order.lines,
    itemCount: order.itemCount,
    totalCents: order.totalCents,
    paidAt: iso(order.paidAt),
    ...stamp("readyAt", order.readyAt),
    ...stamp("pickedUpAt", order.pickedUpAt),
  };
}
