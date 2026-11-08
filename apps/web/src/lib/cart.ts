import {
  type Cart,
  type CartLine,
  CartSchema,
  type PublicMenu,
  priceCart,
  type Receipt,
} from "@slot-order/core";

// The cart (docs/design.md §11.2): core's `Cart` shape, pure functions over it (each answers a new or equal
// object and never mutates its input), and its persistence through an injected storage.

/** What the cart is kept in: `localStorage` in the browser, a Map-backed stub in the tests. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const CART_KEY = "slot-order.cart";

/** Core's `CartLine` maximum (§7.1). */
const MAX_QUANTITY = 20;

/** The cart with `lines` and the promo code of `cart`, if it has one. */
function withLines(cart: Cart, lines: CartLine[]): Cart {
  return cart.promoCode === undefined ? { lines } : { lines, promoCode: cart.promoCode };
}

function copyLine(line: CartLine): CartLine {
  return { itemId: line.itemId, quantity: line.quantity, optionIds: [...line.optionIds] };
}

/** The same option set, order ignored. */
function sameOptions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

function validIndex(cart: Cart, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < cart.lines.length;
}

export function emptyCart(): Cart {
  return { lines: [] };
}

/** Merges into the line with the same item and option set (quantity + 1, at most 20), else appends. */
export function addLine(cart: Cart, itemId: string, optionIds: readonly string[]): Cart {
  const index = cart.lines.findIndex(
    (line) => line.itemId === itemId && sameOptions(line.optionIds, optionIds),
  );
  const lines = cart.lines.map(copyLine);
  const existing = lines[index];
  if (existing === undefined) lines.push({ itemId, quantity: 1, optionIds: [...optionIds] });
  else existing.quantity = Math.min(existing.quantity + 1, MAX_QUANTITY);
  return withLines(cart, lines);
}

/** Floored; below 1 removes the line; above 20 clamps; a bad index changes nothing. */
export function setQuantity(cart: Cart, index: number, quantity: number): Cart {
  if (!validIndex(cart, index)) return withLines(cart, cart.lines.map(copyLine));
  const floored = Math.floor(quantity);
  if (!(floored >= 1)) return removeLine(cart, index);
  const lines = cart.lines.map((line, i) =>
    i === index ? { ...copyLine(line), quantity: Math.min(floored, MAX_QUANTITY) } : copyLine(line),
  );
  return withLines(cart, lines);
}

export function removeLine(cart: Cart, index: number): Cart {
  if (!validIndex(cart, index)) return withLines(cart, cart.lines.map(copyLine));
  return withLines(cart, cart.lines.filter((_, i) => i !== index).map(copyLine));
}

/** Trimmed and upper-cased; empty removes the code. */
export function setPromoCode(cart: Cart, code: string): Cart {
  const lines = cart.lines.map(copyLine);
  const normalised = code.trim().toUpperCase();
  return normalised === "" ? { lines } : { lines, promoCode: normalised };
}

/** The sum of the quantities; 0 for an empty cart. */
export function itemCount(cart: Cart): number {
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}

/** The sum of the quantities of the lines with `itemId`, over every option set; 0 when none (§11.7). */
export function itemQuantity(cart: Cart, itemId: string): number {
  return cart.lines.reduce(
    (total, line) => (line.itemId === itemId ? total + line.quantity : total),
    0,
  );
}

/** Core's `priceCart` on the public menu (no promo codes) and the cart without its code; a CartError propagates. */
export function priceLocally(menu: PublicMenu, cart: Cart): Receipt {
  return priceCart({ ...menu, promoCodes: [] }, { lines: cart.lines });
}

/** The stored cart parsed with `CartSchema`; anything else (a throwing storage included) is the empty cart. */
export function loadCart(storage: StorageLike): Cart {
  try {
    const raw = storage.getItem(CART_KEY);
    if (raw === null) return emptyCart();
    const parsed = CartSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyCart();
  } catch {
    return emptyCart();
  }
}

/** An empty cart is no `Cart` for the schema (it wants a line): saving one removes the key. Never throws. */
export function saveCart(storage: StorageLike, cart: Cart): void {
  if (cart.lines.length === 0) {
    clearCart(storage);
    return;
  }
  try {
    storage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // Storage blocked or full: the cart lives on in memory (§11.2).
  }
}

/** Never throws. */
export function clearCart(storage: StorageLike): void {
  try {
    storage.removeItem(CART_KEY);
  } catch {
    // As saveCart.
  }
}
