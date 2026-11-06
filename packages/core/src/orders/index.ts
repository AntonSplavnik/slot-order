// Order transitions and pickup codes (docs/design.md §8.2, §8.3). Stubs, replaced test-first in M2.
import type { OrderStatus } from "../schemas/orders";

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}

/** The table of §8.2 and nothing else. */
export function canTransition(_from: OrderStatus, _to: OrderStatus): boolean {
  return notImplemented("canTransition");
}

/** The statuses an order may move to from `from`, in the order of §8.2. */
export function nextStatuses(_from: OrderStatus): OrderStatus[] {
  return notImplemented("nextStatuses");
}

/** 8 characters from exactly 8 random bytes (`bytes[i] % 32` into `PICKUP_ALPHABET`), else a RangeError. */
export function pickupCode(_bytes: Uint8Array): string {
  return notImplemented("pickupCode");
}

/** What staff typed, canonical: trimmed, upper-cased, I/L → 1, O → 0, spaces and hyphens removed; null if not 8 chars. */
export function normalizePickupCode(_text: string): string | null {
  return notImplemented("normalizePickupCode");
}
