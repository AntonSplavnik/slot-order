// Pricing (docs/design.md §7). Stubs: M2 is built test-first, the implementation replaces these
// against packages/core/test/pricing/.
import type { Cart } from "../schemas/cart";
import type { Menu } from "../schemas/menu";
import type { Receipt } from "../schemas/receipt";

export { CartError } from "./errors";

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}

/** Prices a cart against the menu (§7.3–§7.5); throws `CartError` (§7.2). */
export function priceCart(_menu: Menu, _cart: Cart): Receipt {
  return notImplemented("priceCart");
}

/** Σ quantity; a combo counts as one item (§7.1). */
export function itemCount(_cart: Cart): number {
  return notImplemented("itemCount");
}

/** Largest-remainder split of `total` in proportion to `weights` (§7.3). */
export function allocate(_total: number, _weights: number[]): number[] {
  return notImplemented("allocate");
}

/** net = round(gross × 100 / (100 + rate)), halves up, integers only; vat = gross − net (§7.4). */
export function splitVat(
  _grossCents: number,
  _rate: number,
): { netCents: number; vatCents: number } {
  return notImplemented("splitVat");
}
