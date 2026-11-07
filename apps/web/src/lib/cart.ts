import type { Cart, PublicMenu, Receipt } from "@slot-order/core";

// The cart (docs/design.md §11.2): core's `Cart` shape, pure functions over it, and its persistence through an
// injected storage. Not implemented yet (M6 contract).

/** What the cart is kept in: `localStorage` in the browser, a Map-backed stub in the tests. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const CART_KEY = "slot-order.cart";

export function emptyCart(): Cart {
  throw new Error("not implemented");
}

/** Merges into the line with the same item and option set (quantity + 1, at most 20), else appends. */
export function addLine(_cart: Cart, _itemId: string, _optionIds: readonly string[]): Cart {
  throw new Error("not implemented");
}

/** Below 1 removes the line; above 20 clamps; a bad index changes nothing. */
export function setQuantity(_cart: Cart, _index: number, _quantity: number): Cart {
  throw new Error("not implemented");
}

export function removeLine(_cart: Cart, _index: number): Cart {
  throw new Error("not implemented");
}

/** Trimmed and upper-cased; empty removes the code. */
export function setPromoCode(_cart: Cart, _code: string): Cart {
  throw new Error("not implemented");
}

/** The sum of the quantities; 0 for an empty cart. */
export function itemCount(_cart: Cart): number {
  throw new Error("not implemented");
}

/** Core's `priceCart` on the public menu (no promo codes) and the cart without its code; a CartError propagates. */
export function priceLocally(_menu: PublicMenu, _cart: Cart): Receipt {
  throw new Error("not implemented");
}

/** The stored cart parsed with `CartSchema`; anything else (a throwing storage included) is the empty cart. */
export function loadCart(_storage: StorageLike): Cart {
  throw new Error("not implemented");
}

export function saveCart(_storage: StorageLike, _cart: Cart): void {
  throw new Error("not implemented");
}

export function clearCart(_storage: StorageLike): void {
  throw new Error("not implemented");
}
