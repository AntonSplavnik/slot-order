"use client";

import type { MenuItem, OptionGroup } from "@slot-order/core";
import { useEffect, useState } from "react";
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { Tile } from "@/components/Tile";
import { focusRing, greyTag, primaryButton, roundButton } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { selectionValid, toggleOption, unitPrice } from "@/lib/options";

// The item sheet (docs/design.md §11.1, §11.6): full height on phones, a hero tile, the option groups tagged
// Required or Optional (radio for a `maxChoices: 1` group, checkboxes otherwise), a quantity stepper and the
// pinned "Add n to cart" button, enabled only when every group is within its min and max (§11.2 `options.ts`).

/** CartLine's quantity maximum (§7.1). */
const MAX_QUANTITY = 20;

/** The grey line under a group's name: "Choose 1", "Choose up to 2", "Pick at least 1", … */
function groupHint(group: OptionGroup): string {
  const { minChoices: min, maxChoices: max } = group;
  if (min === max) return `Choose ${max}`;
  if (min === 0) return `Choose up to ${max}`;
  return `Pick at least ${min}, up to ${max}`;
}

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
  const valid = selectionValid(item, selected);

  // The page behind stays put while the sheet is open; Escape closes it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-neutral-900/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="relative flex h-[calc(100dvh-0.75rem)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl motion-safe:animate-[sheet-up_0.22s_cubic-bezier(0.2,0.8,0.2,1)] sm:h-auto sm:max-h-[90dvh]"
      >
        <div className="flex-1 overflow-y-auto">
          <div className="relative">
            <Tile item={item} index={tileIndex} size="hero" />
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={`absolute top-3 left-3 size-10 ${roundButton}`}
            >
              <CloseIcon className="size-5" />
            </button>
          </div>

          <div className="px-4 pt-4 pb-5">
            <h2 id="sheet-title" className="text-2xl leading-tight font-bold tracking-tight">
              {item.name}
            </h2>
            <p className="mt-1 text-lg tabular-nums">{formatCents(item.priceCents)}</p>
            {description !== undefined && (
              <p className="mt-2 text-sm text-neutral-500">{description}</p>
            )}
          </div>

          {item.optionGroups.map((group) => {
            const radio = group.maxChoices === 1;
            return (
              <fieldset key={group.id} className="border-t-8 border-neutral-100 px-4 pt-4 pb-1">
                <legend className="sr-only">{group.name}</legend>
                <div aria-hidden="true" className="flex items-start justify-between gap-3">
                  <span className="text-lg font-bold">{group.name}</span>
                  <span className={`mt-1 shrink-0 ${greyTag}`}>
                    {group.minChoices > 0 ? "Required" : "Optional"}
                  </span>
                </div>
                <p className="text-sm text-neutral-500">{groupHint(group)}</p>
                <div className="mt-1 divide-y divide-neutral-200">
                  {group.options.map((option) => {
                    const checked = selected.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3"
                      >
                        <span className="min-w-0">
                          <span className="block">{option.name}</span>
                          {option.priceDeltaCents !== 0 && (
                            <span className="block text-sm text-neutral-500 tabular-nums">
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
                          className={`grid size-6 shrink-0 place-items-center rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-900 peer-focus-visible:ring-offset-2 ${
                            radio
                              ? checked
                                ? "border-[7px] border-neutral-900"
                                : "border-2 border-neutral-400"
                              : checked
                                ? "bg-neutral-900 text-white"
                                : "border-2 border-neutral-400"
                          }`}
                        >
                          {!radio && checked && <CheckIcon className="size-4" />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          <div className="h-4" />
        </div>

        <div className="space-y-3 border-t border-neutral-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-center">
            <div className="inline-flex items-center rounded-full bg-neutral-100">
              <button
                type="button"
                aria-label="One less"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className={`grid size-11 place-items-center rounded-full text-neutral-900 enabled:hover:bg-neutral-200 disabled:text-neutral-300 ${focusRing}`}
              >
                <MinusIcon />
              </button>
              <span aria-live="polite" className="w-8 text-center font-semibold tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="One more"
                disabled={quantity >= MAX_QUANTITY}
                onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                className={`grid size-11 place-items-center rounded-full text-neutral-900 enabled:hover:bg-neutral-200 disabled:text-neutral-300 ${focusRing}`}
              >
                <PlusIcon />
              </button>
            </div>
          </div>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onAdd(selected, quantity)}
            className={`${primaryButton} w-full`}
          >
            <span>
              Add {quantity} to cart ·{" "}
              <span className="tabular-nums">
                {formatCents(unitPrice(item, selected) * quantity)}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
