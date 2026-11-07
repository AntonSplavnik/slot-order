"use client";

import type { MenuItem } from "@slot-order/core";
import Link from "next/link";
import { useState } from "react";
import { OptionSheet } from "@/components/OptionSheet";
import { useCart } from "@/components/useCart";
import { addLine, itemCount } from "@/lib/cart";
import { menuSections } from "@/lib/menu";
import { formatCents } from "@/lib/money";

// `/`, the menu (docs/design.md §11.1): sections derived from the data, the option sheet for items with groups,
// the cart bar with the item count and the local total.

/** CartSchema's line limit (§7.1): a new line beyond it is refused. */
const MAX_LINES = 30;

export default function MenuPage() {
  const { menu, menuError, cart, receipt, setCart } = useCart();
  const [sheet, setSheet] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  if (menuError !== null) return <p className="text-red-700">{menuError}</p>;
  if (menu === null) return <p className="text-stone-500">Loading the menu…</p>;

  const count = cart === null ? 0 : itemCount(cart);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Order ahead</h1>
        <p className="text-sm text-stone-500">
          Pick your food, choose a pickup slot, pay, show the code.
        </p>
      </div>

      {menuSections(menu).map((section) => (
        <section key={section.id} aria-labelledby={`section-${section.id}`}>
          <h2 id={`section-${section.id}`} className="mb-3 text-lg font-semibold">
            {section.title}
          </h2>
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {section.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => tap(item)}
                  className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-stone-50"
                >
                  <span>
                    <span className="block font-medium">{item.name}</span>
                    {item.description !== undefined && (
                      <span className="block text-sm text-stone-500">{item.description}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {item.optionGroups.length > 0 && <span className="text-stone-500">from </span>}
                    {formatCents(item.priceCents)}
                    <span className="ml-2 inline-block rounded-full bg-orange-600 px-2 text-white">
                      +
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {notice !== null && (
        <p role="status" className="text-center text-sm text-stone-500">
          {notice}
        </p>
      )}

      {count > 0 && receipt !== null && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
          <Link
            href="/checkout"
            className="mx-auto flex max-w-md items-center justify-between rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white"
          >
            <span>
              {count} {count === 1 ? "item" : "items"}
            </span>
            <span>Checkout · {formatCents(receipt.totalCents)}</span>
          </Link>
        </div>
      )}

      {sheet !== null && (
        <OptionSheet item={sheet} onAdd={(ids) => add(sheet, ids)} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
