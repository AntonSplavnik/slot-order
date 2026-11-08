"use client";

import type { MenuItem } from "@slot-order/core";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BagIcon, PlusIcon } from "@/components/icons";
import { describe } from "@/components/menuText";
import { OptionSheet } from "@/components/OptionSheet";
import { Tile, tilePositions } from "@/components/Tile";
import { errorBox, focusRing, greenTag, roundButton } from "@/components/ui";
import { useCart } from "@/components/useCart";
import { addLine, itemCount } from "@/lib/cart";
import { menuSections, type SectionId } from "@/lib/menu";
import { formatCents } from "@/lib/money";

// `/`, the store page (docs/design.md §11.1, §11.6): a cover band, the white card with the name, sticky section
// tabs with a scroll-spy, each section a two-column grid of item cards, the item sheet, the floating cart pill.

/** CartSchema's line limit (§7.1): a new line beyond it is refused. */
const MAX_LINES = 30;
/** The compact header's height (h-12) plus the tab bar's (h-12): where a section's top counts as "reached". */
const STICKY_PX = 96;
const NOTICE_MS = 2500;

/** The faint pattern of glyphs on the cover band: position, size and tilt of each. */
const COVER_PATTERN = [
  { glyph: "🍗", at: "left-[6%] top-[14%] -rotate-12 text-4xl" },
  { glyph: "🍟", at: "left-[30%] top-[58%] rotate-6 text-3xl" },
  { glyph: "🍔", at: "left-[70%] top-[10%] rotate-12 text-3xl" },
  { glyph: "🥤", at: "left-[84%] top-[56%] -rotate-6 text-4xl" },
  { glyph: "🔥", at: "left-[12%] top-[62%] rotate-12 text-2xl" },
  { glyph: "🥗", at: "left-[56%] top-[66%] -rotate-12 text-2xl" },
  { glyph: "🍗", at: "left-[42%] top-[4%] rotate-45 text-2xl" },
] as const;

function CartButton({ count }: { count: number }) {
  const badge = (
    <>
      <BagIcon className="size-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-neutral-900 px-1 text-xs font-semibold text-white tabular-nums">
          {count}
        </span>
      )}
    </>
  );
  if (count === 0) {
    return (
      <span aria-label="Cart, empty" role="img" className={`relative size-10 ${roundButton}`}>
        {badge}
      </span>
    );
  }
  return (
    <Link
      href="/checkout"
      aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
      className={`relative size-10 ${roundButton}`}
    >
      {badge}
    </Link>
  );
}

export default function MenuPage() {
  const { menu, menuError, cart, receipt, setCart } = useCart();
  const [sheet, setSheet] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);
  const [compact, setCompact] = useState(false);
  const [active, setActive] = useState<SectionId | null>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  /** Scroll-spy updates are ignored until then, while a tapped tab's smooth scroll runs. */
  const spyLockedUntil = useRef(0);

  const sections = useMemo(() => (menu === null ? [] : menuSections(menu)), [menu]);
  const positions = useMemo(
    () => (menu === null ? new Map<string, number>() : tilePositions(menu)),
    [menu],
  );
  const sectionKey = sections.map((s) => s.id).join(",");

  // The compact header appears once the store name has scrolled under it.
  useEffect(() => {
    const name = nameRef.current;
    if (name === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(entry !== undefined && !entry.isIntersecting),
      { rootMargin: "-48px 0px 0px 0px" },
    );
    observer.observe(name);
    return () => observer.disconnect();
  }, []);

  // Scroll-spy: the first section inside the band under the sticky bars is the active tab; at the very bottom of
  // the page, the last section (it may never reach the band).
  useEffect(() => {
    if (sectionKey === "") return;
    const ids = sectionKey.split(",") as SectionId[];
    setActive((current) => current ?? ids[0] ?? null);
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        if (Date.now() < spyLockedUntil.current) return;
        const first = ids.find((id) => visible.get(`section-${id}`) === true);
        if (first !== undefined) setActive(first);
      },
      { rootMargin: `-${STICKY_PX}px 0px -55% 0px` },
    );
    for (const id of ids) {
      const element = document.getElementById(`section-${id}`);
      if (element !== null) observer.observe(element);
    }
    const onScroll = () => {
      if (Date.now() < spyLockedUntil.current) return;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const last = ids[ids.length - 1];
      if (atBottom && last !== undefined) setActive(last);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [sectionKey]);

  // The "Added …" toast fades after a moment.
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  function say(text: string): void {
    setNotice({ text, key: Date.now() });
  }

  /** Adds `quantity` of the item with these options: `addLine` that many times (it merges, §11.2). */
  function add(item: MenuItem, optionIds: string[], quantity: number): void {
    if (cart === null) return;
    let next = addLine(cart, item.id, optionIds);
    if (next.lines.length > MAX_LINES) {
      say("Your cart is full.");
      return;
    }
    for (let i = 1; i < quantity; i++) next = addLine(next, item.id, optionIds);
    setCart(next);
    say(`Added ${quantity > 1 ? `${quantity} × ` : ""}${item.name}.`);
    setSheet(null);
  }

  /** The round "+": an item without groups goes into the cart at once, one with groups opens the sheet. */
  function quickAdd(item: MenuItem): void {
    if (item.optionGroups.length > 0) setSheet(item);
    else add(item, [], 1);
  }

  function jumpTo(id: SectionId): void {
    setActive(id);
    spyLockedUntil.current = Date.now() + 800;
    document
      .getElementById(`section-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const count = cart === null ? 0 : itemCount(cart);
  const showPill = count > 0 && receipt !== null;

  return (
    <div className="-mx-4">
      {/* The compact header, once the band has scrolled away. */}
      <div
        aria-hidden={!compact}
        className={`fixed inset-x-0 top-0 z-30 border-b border-neutral-200 bg-white transition-opacity duration-150 ${
          compact ? "opacity-100" : "pointer-events-none invisible opacity-0"
        }`}
      >
        <p className="mx-auto flex h-12 max-w-md items-center justify-center text-base font-semibold">
          Goldhahn
        </p>
      </div>

      {/* The cover band: a warm gradient, the mark, a faint pattern of the glyphs; no text. */}
      <div className="relative h-[180px] overflow-hidden bg-linear-to-br from-amber-300 via-orange-400 to-rose-500">
        <div aria-hidden="true" className="absolute inset-0 opacity-30 select-none">
          {COVER_PATTERN.map((p) => (
            <span key={p.at} className={`absolute ${p.at}`}>
              {p.glyph}
            </span>
          ))}
        </div>
        <span
          aria-hidden="true"
          className="absolute top-[42%] left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-5xl shadow-lg ring-4 ring-amber-200/70"
        >
          🐓
        </span>
        <div className="absolute top-3 right-3">
          <CartButton count={count} />
        </div>
      </div>

      {/* The white card over the band. */}
      <div className="relative -mt-6 rounded-t-3xl bg-white px-4 pt-5">
        <h1 ref={nameRef} className="text-2xl font-bold tracking-tight">
          Goldhahn
        </h1>
        <p className="mt-1 text-sm text-neutral-900">Halal chicken · Pickup only · Berlin</p>
        <p className="mt-0.5 text-sm text-neutral-500">
          Pickup slots every 15 min, pay online, show the QR code
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-neutral-100 px-3 py-2.5 text-center">
            <p className="text-sm font-semibold">Pickup</p>
            <p className="text-xs text-neutral-500">order ahead</p>
          </div>
          <div className="rounded-xl bg-neutral-100 px-3 py-2.5 text-center">
            <p className="text-sm font-semibold">Slots</p>
            <p className="text-xs text-neutral-500">every 15 min</p>
          </div>
        </div>
      </div>

      {menuError !== null ? (
        <p role="alert" className={`${errorBox} mx-4 mt-6 text-base`}>
          {menuError}
        </p>
      ) : menu === null ? (
        <p className="px-4 pt-8 text-neutral-500">Loading the menu…</p>
      ) : (
        <>
          <nav
            aria-label="Menu sections"
            className="sticky top-12 z-20 mt-4 border-b border-neutral-200 bg-white"
          >
            <div className="flex gap-6 overflow-x-auto px-4 [scrollbar-width:none]">
              {sections.map((section) => {
                const isActive = section.id === active;
                return (
                  <button
                    key={section.id}
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => jumpTo(section.id)}
                    className={`relative h-12 shrink-0 text-[15px] font-semibold whitespace-nowrap transition-colors ${
                      isActive ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
                    } ${focusRing}`}
                  >
                    {section.title}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-0 bottom-0 h-[3px] rounded-full ${
                        isActive ? "bg-neutral-900" : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="space-y-8 px-4 pt-5">
            {sections.map((section) => (
              <section
                key={section.id}
                id={`section-${section.id}`}
                aria-labelledby={`heading-${section.id}`}
                className="scroll-mt-28"
              >
                <h2 id={`heading-${section.id}`} className="mb-3 text-xl font-bold">
                  {section.title}
                </h2>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-6">
                  {section.items.map((item) => {
                    const description = describe(menu, item);
                    return (
                      <li key={item.id} className="relative">
                        <button
                          type="button"
                          onClick={() => setSheet(item)}
                          className={`block w-full rounded-xl text-left ${focusRing}`}
                        >
                          <Tile item={item} index={positions.get(item.id) ?? 0} size="grid" />
                          <span className="mt-2 line-clamp-2 block leading-snug font-semibold">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block text-sm tabular-nums">
                            {formatCents(item.priceCents)}
                          </span>
                          {description !== undefined && (
                            <span className="mt-0.5 line-clamp-2 block text-sm text-neutral-500">
                              {description}
                            </span>
                          )}
                          {item.kind === "combo" && (
                            <span className={`mt-1.5 inline-block ${greenTag}`}>Popular</span>
                          )}
                        </button>
                        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3]">
                          <button
                            type="button"
                            aria-label={
                              item.optionGroups.length > 0
                                ? `Choose options for ${item.name}`
                                : `Add ${item.name} to cart`
                            }
                            onClick={() => quickAdd(item)}
                            className={`pointer-events-auto absolute right-2 bottom-2 size-9 ${roundButton}`}
                          >
                            <PlusIcon className="size-5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {notice !== null && (
        <p
          key={notice.key}
          role="status"
          className={`fixed left-1/2 z-50 -translate-x-1/2 animate-[fade-in_0.2s_ease-out] rounded-lg bg-neutral-800 px-4 py-2.5 text-sm whitespace-nowrap text-white shadow-lg ${
            sheet !== null ? "top-4" : showPill ? "bottom-24" : "bottom-6"
          }`}
        >
          {notice.text}
        </p>
      )}

      {showPill && sheet === null && (
        <Link
          href="/checkout"
          className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 inline-flex h-13 -translate-x-1/2 items-center gap-2.5 rounded-full bg-neutral-900 px-6 font-semibold whitespace-nowrap text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)] transition-colors hover:bg-neutral-800 ${focusRing}`}
        >
          <BagIcon className="size-5" />
          <span>
            View cart · <span className="tabular-nums">{count}</span>
          </span>
        </Link>
      )}

      {sheet !== null && menu !== null && (
        <OptionSheet
          item={sheet}
          tileIndex={positions.get(sheet.id) ?? 0}
          description={describe(menu, sheet)}
          onAdd={(ids, quantity) => add(sheet, ids, quantity)}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
