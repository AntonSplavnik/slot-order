"use client";

import type { MenuItem } from "@slot-order/core";
import { type TransitionEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { QuickAddControl } from "@/components/QuickAddControl";
import { Tile } from "@/components/Tile";
import { focusRing, greyTag, press, primaryButton, stepButton } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { groupHint, selectionValid, toggleOption, unitPrice } from "@/lib/options";

// The item page (docs/design.md §11.9, the former option sheet): full screen on phones, the centred panel from
// `sm:`. The hero, one close button that stays put, a compact header that fades in once the title has scrolled
// under it, the title block, the option groups (radio for a `maxChoices: 1` group, checkboxes otherwise), the
// stepper, the "Add a drink" rows and the pinned "Add n to cart" button, enabled only when every group is within
// its min and max (§11.2 `options.ts`). A modal dialog: focus to the close button on open, every other body child
// `inert` but the live region, focus back to the opener after it unmounts. Escape, the X, the backdrop and "Add"
// start the exit (M2); the parent unmounts it in `onClosed`.

/** CartLine's quantity maximum (§7.1). */
const MAX_QUANTITY = 20;
/** The compact header's row height: the title counts as scrolled away once it is above this line. */
const HEADER_PX = 56;
/** The exit's fallback, in case no `transitionend` arrives (M2). */
const EXIT_FALLBACK_MS = 300;
const EXIT_PROPERTIES = new Set(["translate", "scale", "opacity"]);

/** The panel's motion (M1 entrance by `@starting-style`, M2 exit by the `closing` state). One duration per variant. */
const PANEL_OPEN =
  "duration-300 ease-drawer motion-safe:starting:translate-y-full motion-reduce:starting:opacity-0 motion-reduce:duration-200 sm:duration-250 sm:ease-out-strong sm:motion-safe:starting:translate-y-0 sm:motion-safe:starting:scale-96 sm:starting:opacity-0";
const PANEL_CLOSING =
  "translate-y-full duration-200 ease-drawer sm:translate-y-0 sm:scale-96 sm:opacity-0 sm:duration-150 sm:ease-out-strong motion-reduce:translate-y-0 motion-reduce:opacity-0 motion-reduce:duration-150";

export function ItemPage({
  item,
  tileIndex,
  description,
  drinks,
  tileIndexOf,
  quantityOf,
  onAdd,
  onAddDrink,
  onRemoveDrink,
  onClosed,
}: {
  item: MenuItem;
  tileIndex: number;
  description: string | undefined;
  /** The "Add a drink" rows (§11.2 `upsellItems`); none → no rows. */
  drinks: MenuItem[];
  tileIndexOf: (itemId: string) => number;
  /** The cart's `itemQuantity`. */
  quantityOf: (itemId: string) => number;
  /** Adds the item; false when the cart refused it (the page then stays open). */
  onAdd: (optionIds: string[], quantity: number) => boolean;
  /** One more of a drink, the toast at the top (the page stays open). */
  onAddDrink: (drink: MenuItem) => void;
  /** One fewer of a drink (`removeOne`), the toast at the top. */
  onRemoveDrink: (drink: MenuItem) => void;
  /** The exit has ended: unmount the page. */
  onClosed: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [closing, setClosing] = useState(false);
  const [compact, setCompact] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closingRef = useRef(false);
  const closedRef = useRef(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const valid = selectionValid(item, selected);

  // Focus in on open, the page behind inert (the live region excepted) and still; on unmount `inert` goes first,
  // then focus returns to the opener (focus cannot land in an inert subtree).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = rootRef.current;
    const behind = Array.from(document.body.children).filter(
      (element) =>
        element !== root &&
        !element.hasAttribute("inert") &&
        !element.hasAttribute("data-live-region"),
    );
    for (const element of behind) element.setAttribute("inert", "");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      for (const element of behind) element.removeAttribute("inert");
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  /** Ends the exit, once: the parent unmounts the page. */
  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClosedRef.current();
  }, []);

  /** Starts the exit once; the panel's `transitionend` or the fallback ends it. */
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(finish, EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [closing, finish]);

  // Escape closes it (ignored while it is closing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // The compact header: compact once the title has scrolled above the header's bottom line (M3).
  useEffect(() => {
    const scroller = scrollerRef.current;
    const title = titleRef.current;
    if (scroller === null || title === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;
        const top = entry.rootBounds?.top ?? 0;
        setCompact(!entry.isIntersecting && entry.boundingClientRect.top < top + HEADER_PX);
      },
      { root: scroller, rootMargin: `-${HEADER_PX}px 0px 0px 0px` },
    );
    observer.observe(title);
    return () => observer.disconnect();
  }, []);

  function onPanelTransitionEnd(event: TransitionEvent<HTMLDivElement>): void {
    if (!closingRef.current || event.target !== event.currentTarget) return;
    if (EXIT_PROPERTIES.has(event.propertyName)) finish();
  }

  const hasDrinks = drinks.length > 0;

  return createPortal(
    <div
      ref={rootRef}
      className={`fixed inset-0 z-40 flex justify-center sm:items-center ${closing ? "pointer-events-none" : ""}`}
    >
      <button
        type="button"
        aria-label="Close item"
        tabIndex={-1}
        onClick={close}
        className={`absolute inset-0 bg-black/40 transition-opacity ease-out-strong starting:opacity-0 ${
          closing ? "opacity-0 duration-200" : "duration-300"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-title"
        onTransitionEnd={onPanelTransitionEnd}
        className={`relative flex h-full w-full flex-col overflow-hidden bg-white transition-[translate,scale,opacity] sm:h-auto sm:max-h-[90dvh] sm:max-w-md sm:rounded-2xl ${
          closing ? PANEL_CLOSING : PANEL_OPEN
        }`}
      >
        {/* The compact header: decorative (it repeats the title); the close button above it does the work. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 bg-white pt-[env(safe-area-inset-top,0px)] shadow-[0_1px_6px_rgba(0,0,0,0.3)] transition-opacity duration-150 ease-out-strong ${
            compact ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex h-14 items-center px-[60px]">
            <p className="min-w-0 flex-1 truncate text-center text-label-lg">{item.name}</p>
          </div>
        </div>

        {/* One close button that stays put while the hero scrolls away; its white circle gives way to the header. */}
        <button
          ref={closeRef}
          type="button"
          aria-label="Close item"
          onClick={close}
          className={`absolute top-[calc(6px+env(safe-area-inset-top,0px))] left-2 z-20 grid size-11 place-items-center rounded-full text-ink ${press} ${focusRing}`}
        >
          <span
            aria-hidden="true"
            className={`absolute inset-0 rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.18)] transition-opacity duration-150 ease-out-strong ${
              compact ? "opacity-0" : "opacity-100"
            }`}
          />
          <CloseIcon className="relative size-6" />
        </button>

        <div
          ref={scrollerRef}
          className={`min-h-0 flex-1 scroll-pt-14 overflow-y-auto overscroll-contain ${hasDrinks ? "bg-well" : ""}`}
        >
          <div className="bg-white">
            <Tile item={item} index={tileIndex} size="hero" />

            <div className="px-4 pb-4">
              <h2 ref={titleRef} id="item-title" className="mt-4 text-title">
                {item.name}
              </h2>
              <p className="mt-2 text-price-lg tabular-nums">{formatCents(item.priceCents)}</p>
              {description !== undefined && (
                <p className="mt-3 text-body-sm text-ink-3">{description}</p>
              )}
            </div>

            {item.optionGroups.map((group) => {
              const radio = group.maxChoices === 1;
              const tag = group.minChoices > 0 ? "Required" : "Optional";
              const hint = groupHint(group);
              return (
                <div key={group.id}>
                  <div aria-hidden="true" className="h-1 bg-line-2" />
                  <fieldset className="px-4 py-4">
                    <legend className="sr-only">
                      {group.name}, {tag.toLowerCase()}. {hint}.
                    </legend>
                    <div aria-hidden="true">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-heading">{group.name}</span>
                        <span className={`shrink-0 ${greyTag}`}>{tag}</span>
                      </div>
                      <p className="mt-0.5 text-body-sm text-ink-2">{hint}</p>
                    </div>
                    <div className="divide-y divide-line-2">
                      {group.options.map((option) => {
                        const checked = selected.includes(option.id);
                        const mark = `transition-[scale,opacity] duration-150 ease-out-strong ${
                          checked
                            ? "scale-100 opacity-100"
                            : "scale-50 opacity-0 motion-reduce:scale-100"
                        }`;
                        return (
                          <label
                            key={option.id}
                            className="flex min-h-18 cursor-pointer touch-manipulation items-center justify-between gap-3 py-3 select-none"
                          >
                            <span className="min-w-0">
                              <span className="block text-body">{option.name}</span>
                              {option.priceDeltaCents !== 0 && (
                                <span className="mt-0.5 block text-body-sm text-ink-2 tabular-nums">
                                  {option.priceDeltaCents > 0 ? "+" : "−"}
                                  {formatCents(Math.abs(option.priceDeltaCents))}
                                </span>
                              )}
                            </span>
                            <input
                              type={radio ? "radio" : "checkbox"}
                              name={group.id}
                              checked={checked}
                              onChange={() => setSelected((s) => toggleOption(group, s, option.id))}
                              className="peer sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={`grid size-[18px] shrink-0 place-items-center border-[1.5px] transition-colors duration-150 ease-out-strong peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 ${
                                radio
                                  ? `rounded-full ${checked ? "border-ink" : "border-ink-3"}`
                                  : `rounded border-ink text-white ${checked ? "bg-ink" : "bg-transparent"}`
                              }`}
                            >
                              {radio ? (
                                <span className={`size-2 rounded-full bg-ink ${mark}`} />
                              ) : (
                                <CheckIcon className={`size-3.5 ${mark}`} />
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              );
            })}

            <div aria-hidden="true" className="h-1 bg-line-2" />
          </div>

          {/* The stepper; over the drinks' `well` area its white section ends in rounded corners. */}
          <div className={`bg-white p-4 ${hasDrinks ? "rounded-b-[20px]" : ""}`}>
            <div className="inline-flex h-9 w-[130px] items-center justify-between rounded-full bg-well">
              <button
                type="button"
                aria-label="Remove one"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className={stepButton}
              >
                <MinusIcon className="size-5" />
              </button>
              <span aria-live="polite" className="text-body-strong tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Add one"
                disabled={quantity >= MAX_QUANTITY}
                onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                className={stepButton}
              >
                <PlusIcon className="size-5" />
              </button>
            </div>
          </div>

          {hasDrinks && (
            <section aria-labelledby="drinks-title" className="py-5">
              <div className="rounded-[20px] bg-white">
                <h3 id="drinks-title" className="p-4 text-heading">
                  Add a drink
                </h3>
                <ul className="pl-4">
                  {drinks.map((drink) => (
                    <li
                      key={drink.id}
                      className="flex min-h-20 items-center gap-4 border-b border-line-2 py-4 pr-4 last:border-b-0"
                    >
                      <Tile item={drink} index={tileIndexOf(drink.id)} size="row" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-body-strong">{drink.name}</p>
                        <p className="text-body-sm text-ink tabular-nums">
                          {formatCents(drink.priceCents)}
                        </p>
                      </div>
                      <QuickAddControl
                        item={drink}
                        quantity={quantityOf(drink.id)}
                        onAdd={() => onAddDrink(drink)}
                        onRemove={() => onRemoveDrink(drink)}
                        className="shrink-0"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>

        <div className="border-t-2 border-line-2 bg-white px-4 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              if (onAdd(selected, quantity)) close();
            }}
            className={`${primaryButton} w-full`}
          >
            <span>
              Add {quantity} to cart •{" "}
              <span className="tabular-nums">
                {formatCents(unitPrice(item, selected) * quantity)}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
