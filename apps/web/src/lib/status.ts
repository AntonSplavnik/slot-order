import type { CancelReason, OrderStatus, OrderSummary } from "@slot-order/core";

// The status page's texts (docs/design.md §11.1, §11.2).

export type StatusTone = "waiting" | "good" | "done" | "bad";
export type StatusView = { title: string; body: string; tone: StatusTone };

const CANCELLED_BODY: Record<CancelReason, string> = {
  stripe_failed: "Payment could not be started; nothing was charged.",
  session_expired: "The payment page expired; nothing was charged.",
  refunded_slot_full: "Payment refunded: the slot filled up while you were paying.",
};

export function statusView(order: OrderSummary): StatusView {
  switch (order.status) {
    case "held":
      return {
        title: "Waiting for your payment",
        body: "Your slot is held for a few minutes while you pay.",
        tone: "waiting",
      };
    case "paid":
      return {
        title: "Paid",
        body: `Pick up at ${order.slotLabel}. Show this code at the counter.`,
        tone: "good",
      };
    case "ready":
      return {
        title: "Ready, come and get it",
        body: `Pick up at ${order.slotLabel}.`,
        tone: "good",
      };
    case "picked_up":
      return { title: "Enjoy your meal", body: "", tone: "done" };
    case "expired":
      return { title: "Your slot hold ran out", body: "Start again from the menu.", tone: "bad" };
    case "cancelled":
      return {
        title: "Order cancelled",
        body:
          order.cancelReason === undefined
            ? "Nothing was charged."
            : CANCELLED_BODY[order.cancelReason],
        tone: "bad",
      };
  }
}

/** Only a held order is polled. */
export function shouldPoll(status: OrderStatus): boolean {
  return status === "held";
}
