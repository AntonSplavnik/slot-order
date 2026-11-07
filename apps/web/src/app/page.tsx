"use client";

import type { MenuItem, PublicMenu } from "@slot-order/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BagIcon, PlusIcon } from "@/components/icons";
import { OptionSheet } from "@/components/OptionSheet";
import { focusRing, primaryButton } from "@/components/ui";
import { useCart } from "@/components/useCart";
import { addLine, itemCount } from "@/lib/cart";
import { itemById, menuSections } from "@/lib/menu";
import { formatCents } from "@/lib/money";

// `/`, the menu (docs/design.md §11.1): sections derived from the data, the option sheet for items with groups,
// the cart bar with the item count and the local total.

/** CartSchema's line limit (§7.1): a new line beyond it is refused. */
const MAX_LINES = 30;

/** A combo's components in words, like "2 × Wings, Fries". */
function componentsText(menu: PublicMenu, item: MenuItem): string {
  return item.components
    .map((c) => {
      const name = itemById(menu, c.itemId)?.name ?? c.itemId;
      return c.quantity > 1 ? `${c.quantity} × ${name}` : name;
    })
    .join(", ");
}

export default function MenuPage() {
  const { menu, menuError, cart, receipt, setCart } = useCart();
  const [sheet, setSheet] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The top bar's slot for the cart badge (layout.tsx), found after mount.
  const [topBar, setTopBar] = useState<HTMLElement | null>(null);
  useEffect(() => setTopBar(document.getElementById("top-bar-action")), []);

  function add(item: MenuItem, optionIds: string[]): void {
    if (cart === null) return;
    const next = addLine(cart, item.id, optionIds);
    if (next.lines.length > MAX_LINES) {
      setNotice("Your cart is full.");
      return;
    }
    setCart(next);
    setNotice(`Added ${item.name}.`);
    setSheet(null);
  }

  function tap(item: MenuItem): void {
    if (item.optionGroups.length > 0) setSheet(item);
    else add(item, []);
  }

  if (menuError !== null) {
    return (
      <p
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700"
      >
        {menuError}
      </p>
    );
  }
  if (menu === null) return <p className="text-stone-500">Loading the menu…</p>;

  const count = cart === null ? 0 : itemCount(cart);
  const showBar = count > 0 && receipt !== null;
  const noticeLine =
    notice === null ? null : (
      <p role="status" className="text-center text-sm text-stone-600">
        {notice}
      </p>
    );

  return (
    <div className="space-y-8">
      {topBar !== null &&
        count > 0 &&
        createPortal(
          <Link
            href="/checkout"
            aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
            className={`relative grid size-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 transition-colors hover:bg-stone-50 ${focusRing}`}
          >
            <BagIcon className="size-6" />
            <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-orange-600 px-1 text-xs font-semibold text-white tabular-nums">
              {count}
            </span>
          </Link>,
          topBar,
        )}

      <div className="rounded-2xl bg-orange-50 px-4 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Order ahead</h1>
        <p className="mt-1 text-sm text-stone-600">
          Pick your food, choose a pickup slot, pay, show the code.
        </p>
      </div>

      {menuSections(menu).map((section) => (
        <section key={section.id} aria-labelledby={`section-${section.id}`} className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 id={`section-${section.id}`} className="text-lg font-semibold">
              {section.title}
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-stone-200" />
          </div>
          <ul className="space-y-3">
            {section.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => tap(item)}
                  className={`flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-stone-300 active:bg-stone-50 ${focusRing}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.name}</span>
                    {item.description !== undefined && (
                      <span className="mt-0.5 block text-sm text-stone-600">
                        {item.description}
                      </span>
                    )}
                    {item.kind === "combo" && item.components.length > 0 && (
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {componentsText(menu, item)}
                      </span>
                    )}
                    {item.optionGroups.length > 0 && (
                      <span className="mt-1.5 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                        Options
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {item.optionGroups.length > 0 && (
                      <span className="block text-xs text-stone-500">from</span>
                    )}
                    <span className="block font-medium">{formatCents(item.priceCents)}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-600 text-white"
                  >
                    <PlusIcon />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!showBar && noticeLine}

      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] backdrop-blur">
          <div className="mx-auto max-w-md space-y-2">
            {noticeLine}
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">
                <span className="font-medium">
                  {count} {count === 1 ? "item" : "items"}
                </span>
                <span className="text-stone-500"> · </span>
                <span className="font-semibold tabular-nums">
                  {formatCents(receipt.totalCents)}
                </span>
              </p>
              <Link href="/checkout" className={`${primaryButton} shrink-0`}>
                Go to checkout
              </Link>
            </div>
          </div>
        </div>
      )}

      {sheet !== null && (
        <OptionSheet item={sheet} onAdd={(ids) => add(sheet, ids)} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
