import type { OrderStatus } from "../schemas/orders";

// The transition table of docs/design.md §8.2: the API and the SQL functions agree on it.

/** Per status, the statuses it may move to, in the order of §8.2's rows. */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  held: ["paid", "expired", "cancelled"],
  paid: ["ready", "picked_up"],
  ready: ["picked_up"],
  picked_up: [],
  expired: ["paid", "cancelled"],
  cancelled: [],
};

/** The table of §8.2 and nothing else. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The statuses an order may move to from `from`, in the order of §8.2. */
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[from]];
}
