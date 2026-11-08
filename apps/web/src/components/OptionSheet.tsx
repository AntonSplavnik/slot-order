"use client";

import type { MenuItem, OptionGroup } from "@slot-order/core";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { Tile } from "@/components/Tile";
import { focusRing, greyTag, press, primaryButton, roundButton } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { selectionValid, toggleOption, unitPrice } from "@/lib/options";

// The item sheet (docs/design.md §11.1, §11.6, §11.7): full height on phones, a hero tile, the option groups
// tagged Required or Optional (radio for a `maxChoices: 1` group, checkboxes otherwise), a quantity stepper and
// the pinned "Add n to cart" button, enabled only when every group is within its min and max (§11.2
// `options.ts`). A modal dialog: focus moves to the close button on open, the page behind is `inert`, focus
// returns to the opener on close; Escape and the backdrop close it.

/** CartLine's quantity maximum (§7.1). */
const MAX_QUANTITY = 20;

/** The grey line under a group's name: "Choose 1", "Choose up to 2", "Pick at least 1", … */
function groupHint(group: OptionGroup): string {
  const { minChoices: min, maxChoices: max } = group;
  if (min === max) return `Choose ${max}`;
  if (min === 0) return `Choose up to ${max}`;
  return `Pick at least ${min}, up to ${max}`;
}

/** The stepper's round buttons inside the 36 high pill. */
const stepButton = `grid size-9 place-items-center rounded-full text-ink disabled:text-mute ${press} ${focusRing}`;

export function OptionSheet({
  item,
  tileIndex,
  description,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  tileIndex: number;
  description: string | undefined;
  onAdd: (optionIds: string[], quantity: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const valid = selectionValid(item, selected);

  // Focus in on open, the page behind inert and still, focus back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = rootRef.current;
    const behind = Array.from(document.body.children).filter(
      (element) => element !== root && !element.hasAttribute("inert"),
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

  // Escape closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close item"
        tabIndex={-1}
        className="absolute inset-0 animate-fade-in bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="relative flex h-[calc(100dvh-0.75rem)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white motion-safe:animate-sheet-up motion-reduce:animate-fade-in sm:h-auto sm:max-h-[90dvh]"
      >
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="relative">
            <Tile item={item} index={tileIndex} size="hero" />
            <button
              ref={closeRef}
              type="button"
              aria-label="Close item"
              onClick={onClose}
              className={`absolute top-2 left-2 size-11 ${roundButton}`}
            >
              <CloseIcon className="size-6" />
            </button>
          </div>

          <div className="px-4 pb-4">
            <h2 id="sheet-title" className="mt-4 text-title">
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
            return (
              <div key={group.id}>
                <div aria-hidden="true" className="h-1 bg-line-2" />
                <fieldset className="px-4 py-4">
                  <legend className="sr-only">
                    {group.name}, {tag.toLowerCase()}. {groupHint(group)}.
                  </legend>
                  <div aria-hidden="true">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-heading">{group.name}</span>
                      <span className={`shrink-0 ${greyTag}`}>{tag}</span>
                    </div>
                    <p className="mt-0.5 text-body-sm text-ink-2">{groupHint(group)}</p>
                  </div>
                  <div className="divide-y divide-line-2">
                    {group.options.map((option) => {
                      const checked = selected.includes(option.id);
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
                            className={`grid size-[18px] shrink-0 place-items-center border-[1.5px] peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 ${
                              radio
                                ? `rounded-full ${checked ? "border-ink" : "border-ink-3"}`
                                : `rounded border-ink ${checked ? "bg-ink text-white" : ""}`
                            }`}
                          >
                            {radio && checked && <span className="size-2 rounded-full bg-ink" />}
                            {!radio && checked && <CheckIcon className="size-3.5" />}
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
          <div className="p-4">
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
        </div>

        <div className="bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            disabled={!valid}
            onClick={() => onAdd(selected, quantity)}
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
