import type { OrderStatus, OrderSummary } from "@slot-order/core";

// The status page's texts (docs/design.md §11.1, §11.2). Not implemented yet (M6 contract).

export type StatusTone = "waiting" | "good" | "done" | "bad";
export type StatusView = { title: string; body: string; tone: StatusTone };

export function statusView(_order: OrderSummary): StatusView {
  throw new Error("not implemented");
}

/** Only a held order is polled. */
export function shouldPoll(_status: OrderStatus): boolean {
  throw new Error("not implemented");
}
