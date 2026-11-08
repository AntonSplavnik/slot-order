"use client";

import type { Cart, MenuItem } from "@slot-order/core";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Count } from "@/components/Count";
import { ItemPage } from "@/components/ItemPage";
import { BagIcon, PlusIcon } from "@/components/icons";
import { describe } from "@/components/menuText";
import { QuickAddControl } from "@/components/QuickAddControl";
import { Tile, tilePositions } from "@/components/Tile";
import { errorBox, focusRing, greenTag, press, roundButton } from "@/components/ui";
import { useCart } from "@/components/useCart";
import { addLine, itemCount, itemQuantity, removeOne } from "@/lib/cart";
import { menuSections, quickAdds, type SectionId, upsellItems } from "@/lib/menu";
import { formatCents } from "@/lib/money";
import { coverPhoto } from "@/lib/photos";

// `/`, the store page (docs/design.md §11.1, §11.6, §11.7, §11.9): a cover band, the white card with the name,
// sticky section tabs with a sliding segment and a scroll-spy, each section a two-column grid of item cards, the
// item page, the floating cart pill. A quick-add item (a drink, §11.2 `quickAdds`) goes into the cart from its
// tile or its round "+", which becomes the "−" / count / "+" pill; every other item opens the item page.

/** CartSchema's line limit (§7.1): a new line beyond it is refused. */
const MAX_LINES = 30;
/** The compact header (56) plus the tab bar (44 labels, the 5 px track, 3 px white, the 4 px band = 56): where
 * a section's top counts as "reached". */
const STICKY_PX = 112;
/** The toast's life: the same 2500 ms as `--animate-toast` in globals.css (§11.9 M7). */
const NOTICE_MS = 2500;
/** CartLine's quantity maximum (§7.1). */
const MAX_QUANTITY = 20;
/** The toast's place, fixed when it is raised (§11.9): at the top while the item page stays open, else at the
 * bottom, above the cart pill when there is one. */
const NOTICE_PLACE = { top: "top-4", pill: "bottom-24", bottom: "bottom-6" } as const;
type Notice = { text: string; key: number; place: keyof typeof NOTICE_PLACE };
/** The cover band's photo (§11.8). */
const cover = coverPhoto();

function CartButton({ count }: { count: number }) {
  const badge = (
    <>
      <BagIcon className="size-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-caption-strong text-white tabular-nums">
          <Count value={count} />
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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [compact, setCompact] = useState(false);
  const [active, setActive] = useState<SectionId | null>(null);
  /** The live region's portal needs `document`: it mounts (empty) after the first render. */
  const [mounted, setMounted] = useState(false);
  /** The tab segment: the active tab's place in the tab row, measured (§11.9 M9). */
  const [segment, setSegment] = useState<{ left: number; width: number } | null>(null);
  const [segmentReady, setSegmentReady] = useState(false);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const tabRowRef = useRef<HTMLDivElement>(null);
  const noticeKey = useRef(0);
  /** Scroll-spy updates are ignored until then, while a tapped tab's smooth scroll runs. */
  const spyLockedUntil = useRef(0);

  const sections = useMemo(() => (menu === null ? [] : menuSections(menu)), [menu]);
  const positions = useMemo(
    () => (menu === null ? new Map<string, number>() : tilePositions(menu)),
    [menu],
  );
  const sectionKey = sections.map((s) => s.id).join(",");

  useEffect(() => setMounted(true), []);

  // The compact header appears once the store name has scrolled under it.
  useEffect(() => {
    const name = nameRef.current;
    if (name === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(entry !== undefined && !entry.isIntersecting),
      { rootMargin: "-56px 0px 0px 0px" },
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

  // The tab segment follows the active tab: measured when the active tab changes and when the row resizes (the
  // font swapping in, a rotation), never on scroll. The first placement has no transition.
  useLayoutEffect(() => {
    const row = tabRowRef.current;
    if (row === null || active === null || sectionKey === "") return;
    const measure = () => {
      const tab = row.querySelector<HTMLElement>(`[data-section="${active}"]`);
      if (tab === null) return;
      const next = { left: tab.offsetLeft, width: tab.offsetWidth };
      setSegment((current) =>
        current?.left === next.left && current.width === next.width ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [active, sectionKey]);

  const segmentPlaced = segment !== null;
  useEffect(() => {
    if (!segmentPlaced) return;
    const frame = requestAnimationFrame(() => setSegmentReady(true));
    return () => cancelAnimationFrame(frame);
  }, [segmentPlaced]);

  // The toast ends after its animation; the live region empties with it.
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Raises the toast: at the top when the item page stays open, else at the bottom over or without the pill. */
  function say(text: string, top: boolean, after: Cart): void {
    noticeKey.current += 1;
    const place = top ? "top" : itemCount(after) > 0 ? "pill" : "bottom";
    setNotice({ text, key: noticeKey.current, place });
  }

  /** Adds `quantity` of the item with these options: `addLine` that many times (it merges, §11.2). `top`: the
   * item page stays open after it. False when the cart is full (a refusal keeps an open page open). */
  function add(item: MenuItem, optionIds: string[], quantity: number, top: boolean): boolean {
    if (cart === null) return false;
    let next = addLine(cart, item.id, optionIds);
    if (next.lines.length > MAX_LINES) {
      say("Your cart is full.", sheet !== null, cart);
      return false;
    }
    for (let i = 1; i < quantity; i++) next = addLine(next, item.id, optionIds);
    setCart(next);
    say(`Added ${quantity > 1 ? `${quantity} × ` : ""}${item.name}.`, top, next);
    return true;
  }

  /** One more of a quick-add item (its tile, its "+"); at 20 nothing is added. */
  function addOne(item: MenuItem, top: boolean): void {
    if (cart === null) return;
    if (itemQuantity(cart, item.id) >= MAX_QUANTITY) {
      say("You can add up to 20.", top, cart);
      return;
    }
    add(item, [], 1, top);
  }

  /** One fewer of a quick-add item (the pill's "−", §11.2 `removeOne`). */
  function removeOneOf(item: MenuItem, top: boolean): void {
    if (cart === null) return;
    const next = removeOne(cart, item.id);
    setCart(next);
    say(`Removed ${item.name}.`, top, next);
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
      {/* The compact header, once the band has scrolled away; it fades both ways (M3). */}
      <div
        aria-hidden={!compact}
        className={`fixed inset-x-0 top-0 z-30 bg-white transition-opacity duration-150 ease-out-strong ${
          compact ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <p className="mx-auto flex h-14 max-w-md items-center justify-center text-label-lg">
          Goldhahn
        </p>
      </div>

      {/* The cover band: the cover photo under a soft gradient, the mark; no text. */}
      <div className="relative h-[260px] overflow-hidden bg-ink">
        {/* biome-ignore lint/performance/noImgElement: plain files from public/, no image optimiser on the Worker (§11.8) */}
        <img
          src={cover.src}
          alt=""
          width={1284}
          height={780}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-b from-black/20 via-transparent via-35% to-black/10"
        />
        <span
          aria-hidden="true"
          className="absolute top-[45%] left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-5xl shadow-lg ring-4 ring-amber-200/70"
        >
          🐓
        </span>
        <div className="absolute top-3 right-3">
          <CartButton count={count} />
        </div>
      </div>

      {/* The white card over the band. */}
      <div className="relative -mt-6 rounded-t-3xl bg-white px-4 pt-5">
        <h1 ref={nameRef} className="text-title">
          Goldhahn
        </h1>
        <p className="mt-1 text-body-sm text-ink">Halal chicken • Pickup only • Berlin</p>
        <p className="text-body-sm text-ink-3">Order ahead and show the QR code at the counter</p>
        <p className="mt-2 inline-flex h-6 items-center rounded bg-green-soft px-2 text-label text-green-soft-text">
          Pay online, pick up on time
        </p>
        <div className="mt-4 grid h-18 grid-cols-2 divide-x divide-line rounded-xl border border-line">
          <div className="flex flex-col items-center justify-center text-center">
            <p className="text-label text-ink">Pickup only</p>
            <p className="text-caption text-ink-3">order ahead</p>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <p className="text-label text-ink">Every 15 min</p>
            <p className="text-caption text-ink-3">pickup slots</p>
          </div>
        </div>
      </div>

      {menuError !== null ? (
        <p role="alert" className={`${errorBox} mx-4 mt-6`}>
          {menuError}
        </p>
      ) : menu === null ? (
        <p className="px-4 pt-8 text-body text-ink-3">Loading the menu…</p>
      ) : (
        <>
          <nav aria-label="Menu sections" className="sticky top-14 z-20 mt-4 bg-white">
            <div className="overflow-x-auto [scrollbar-width:none]">
              <div
                ref={tabRowRef}
                className="relative flex w-max min-w-full px-4 shadow-[inset_0_-5px_0_var(--color-line)]"
              >
                {sections.map((section) => {
                  const isActive = section.id === active;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      data-section={section.id}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => jumpTo(section.id)}
                      className={`h-[49px] shrink-0 px-4 pb-[5px] text-label whitespace-nowrap transition-colors duration-150 ${
                        isActive ? "text-ink" : "text-ink-3 hover:text-ink"
                      } ${focusRing}`}
                    >
                      {section.title}
                    </button>
                  );
                })}
                {/* One segment under the active tab, sliding between tabs (M9). */}
                {segment !== null && (
                  <span
                    aria-hidden="true"
                    style={{
                      transform: `translateX(${segment.left}px) scaleX(${segment.width / 100})`,
                    }}
                    className={`absolute bottom-0 left-0 h-[5px] w-[100px] origin-left bg-ink ${
                      segmentReady
                        ? "transition-transform duration-250 ease-in-out-strong motion-reduce:transition-none"
                        : ""
                    }`}
                  />
                )}
              </div>
            </div>
            <div aria-hidden="true" className="mt-[3px] h-1 bg-line-2" />
          </nav>

          <div className="px-4 pb-6">
            {sections.map((section) => (
              <section
                key={section.id}
                id={`section-${section.id}`}
                aria-labelledby={`heading-${section.id}`}
                className="scroll-mt-28 pt-6"
              >
                <h2 id={`heading-${section.id}`} className="mb-4 text-heading">
                  {section.title}
                </h2>
                <ul className="grid grid-cols-2 gap-x-2 gap-y-5">
                  {section.items.map((item) => {
                    const description = describe(menu, item);
                    const inCart = cart === null ? 0 : itemQuantity(cart, item.id);
                    const quick = quickAdds(item);
                    return (
                      <li key={item.id} className="relative">
                        {/* Pointer only: its function is on the round button or the pill. */}
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => (quick ? addOne(item, false) : setSheet(item))}
                          className={`block w-full rounded-xl text-left ${press} ${focusRing}`}
                        >
                          <Tile item={item} index={positions.get(item.id) ?? 0} size="grid" />
                          <span className="mt-2 line-clamp-2 block text-body-strong">
                            {item.name}
                          </span>
                          <span className="block text-body-sm text-ink tabular-nums">
                            {formatCents(item.priceCents)}
                          </span>
                          {description !== undefined && (
                            <span className="line-clamp-2 block text-body-sm text-ink-3">
                              {description}
                            </span>
                          )}
                          {item.kind === "combo" && (
                            <span className={`mt-2 ${greenTag}`}>Popular</span>
                          )}
                          {quick && <span className="sr-only">, add one</span>}
                        </button>
                        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
                          {quick ? (
                            <QuickAddControl
                              item={item}
                              quantity={inCart}
                              onAdd={() => addOne(item, false)}
                              onRemove={() => removeOneOf(item, false)}
                              className="pointer-events-auto absolute right-2 bottom-2"
                            />
                          ) : (
                            <button
                              type="button"
                              aria-label={`${inCart > 0 ? `${inCart} in cart. ` : ""}Add ${item.name}`}
                              aria-haspopup="dialog"
                              onClick={() => setSheet(item)}
                              className={`pointer-events-auto absolute right-2 bottom-2 size-9 ${roundButton}`}
                            >
                              <Count value={inCart} className="text-body-strong tabular-nums">
                                {inCart > 0 ? inCart : <PlusIcon className="size-4" />}
                              </Count>
                            </button>
                          )}
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

      {/* Every toast's text, for screen readers: one region, always mounted (empty at first), outside the page
          the item page makes inert. */}
      {mounted &&
        createPortal(
          <div data-live-region="" role="status" className="sr-only">
            {notice !== null && <span key={notice.key}>{notice.text}</span>}
          </div>,
          document.body,
        )}

      {notice !== null &&
        // Into the body, beside the item page, so it is not inside the page the open item page makes inert. The
        // live region above speaks it; this one is for the eyes (M7: one keyframe over its life).
        createPortal(
          <p
            key={notice.key}
            aria-hidden="true"
            className={`fixed left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-ink px-4 py-3 text-center text-label text-white motion-reduce:animate-toast-fade ${
              notice.place === "top" ? "motion-safe:animate-toast-top" : "motion-safe:animate-toast"
            } ${NOTICE_PLACE[notice.place]}`}
          >
            {notice.text}
          </p>,
          document.body,
        )}

      {/* The cart pill rises when the cart stops being empty (M6); it stays mounted under the item page. */}
      {showPill && (
        <Link
          href="/checkout"
          className={`fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-1/2 z-20 inline-flex h-14 -translate-x-1/2 items-center gap-2.5 rounded-full bg-ink px-6 text-label-lg whitespace-nowrap text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)] transition-[transform,translate,scale,opacity] duration-250 ease-out-strong starting:opacity-0 motion-safe:starting:[transform:translateY(16px)] active:duration-150 not-disabled:active:scale-[0.97] ${focusRing}`}
        >
          <BagIcon className="size-5" />
          <span>
            View cart • <Count value={count} className="tabular-nums" />
          </span>
        </Link>
      )}

      {sheet !== null && menu !== null && (
        <ItemPage
          key={sheet.id}
          item={sheet}
          tileIndex={positions.get(sheet.id) ?? 0}
          description={describe(menu, sheet)}
          drinks={upsellItems(menu, sheet)}
          tileIndexOf={(id) => positions.get(id) ?? 0}
          quantityOf={(id) => (cart === null ? 0 : itemQuantity(cart, id))}
          onAdd={(ids, quantity) => add(sheet, ids, quantity, false)}
          onAddDrink={(drink) => addOne(drink, true)}
          onRemoveDrink={(drink) => removeOneOf(drink, true)}
          onClosed={() => setSheet(null)}
        />
      )}
    </div>
  );
}
