"use client";

import { type Cart, CartError, type PublicMenu, type Receipt } from "@slot-order/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { emptyCart, loadCart, priceLocally, removeLine, saveCart } from "@/lib/cart";
import { api, browserStorage, messageOf } from "./browser";

// The menu and the stored cart, shared by `/` and `/checkout` (docs/design.md §11.1, §11.2 `cart.ts`).

/** Prices the cart locally; a CartError with a line drops that line and tries again (§11.1: an item vanished
 * from the menu). Any other CartError empties the cart. */
function priceOrRepair(menu: PublicMenu, cart: Cart): { cart: Cart; receipt: Receipt | null } {
  let current = cart;
  while (current.lines.length > 0) {
    try {
      return { cart: current, receipt: priceLocally(menu, current) };
    } catch (error) {
      if (!(error instanceof CartError)) throw error;
      if (error.lineIndex === undefined) return { cart: emptyCart(), receipt: null };
      current = removeLine(current, error.lineIndex);
    }
  }
  return { cart: current, receipt: null };
}

export type CartState = {
  menu: PublicMenu | null;
  menuError: string | null;
  /** `null` until the stored cart is read (after the first render, so the server render matches). */
  cart: Cart | null;
  /** Local pricing of the cart (§7), `null` while loading or for an empty cart. */
  receipt: Receipt | null;
  setCart: (cart: Cart) => void;
};

export function useCart(): CartState {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [cart, setCartState] = useState<Cart | null>(null);

  useEffect(() => {
    setCartState(loadCart(browserStorage()));
    let cancelled = false;
    api.menu().then(
      (loaded) => {
        if (!cancelled) setMenu(loaded);
      },
      (error: unknown) => {
        if (!cancelled) setMenuError(messageOf(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setCart = useCallback((next: Cart) => {
    setCartState(next);
    saveCart(browserStorage(), next);
  }, []);

  const priced = useMemo(
    () => (menu === null || cart === null ? null : priceOrRepair(menu, cart)),
    [menu, cart],
  );

  // A repaired cart (a line dropped) is stored, so the next visit starts from it.
  useEffect(() => {
    if (priced !== null && priced.cart !== cart) setCart(priced.cart);
  }, [priced, cart, setCart]);

  return {
    menu,
    menuError,
    cart: priced?.cart ?? cart,
    receipt: priced?.receipt ?? null,
    setCart,
  };
}
