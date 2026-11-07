"use client";

import type { MenuItem } from "@slot-order/core";
import { useState } from "react";
import { focusRing, primaryButton } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { selectionValid, toggleOption, unitPrice } from "@/lib/options";

// The option sheet (docs/design.md §11.1): radio inputs for a `maxChoices: 1` group, checkboxes otherwise; Add
// is enabled only when every group is within its min and max (§11.2 `options.ts`).

export function OptionSheet({
  item,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  onAdd: (optionIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const valid = selectionValid(item, selected);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-stone-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-stone-300" />
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 pt-3 pb-4">
          <div className="min-w-0">
            <h2 id="sheet-title" className="text-lg font-semibold">
              {item.name}
            </h2>
            <p className="font-medium text-stone-900 tabular-nums">
              {formatCents(item.priceCents)}
            </p>
            {item.description !== undefined && (
              <p className="mt-1 text-sm text-stone-600">{item.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`-mr-2 min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-stone-500 hover:text-stone-900 ${focusRing}`}
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {item.optionGroups.map((group) => {
            const radio = group.maxChoices === 1;
            const hint = radio
              ? group.minChoices === 0
                ? "Optional"
                : "Choose one"
              : `Up to ${group.maxChoices}${group.minChoices > 0 ? `, at least ${group.minChoices}` : ""}`;
            return (
              <fieldset key={group.id}>
                <legend className="mb-2 flex w-full items-baseline justify-between gap-3">
                  <span className="font-semibold">{group.name}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                    {hint}
                  </span>
                </legend>
                <div className="space-y-2">
                  {group.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-3 transition-colors hover:border-stone-300 has-checked:border-orange-600 has-checked:bg-orange-50 has-focus-visible:ring-2 has-focus-visible:ring-orange-600 has-focus-visible:ring-offset-2"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type={radio ? "radio" : "checkbox"}
                          name={group.id}
                          checked={selected.includes(option.id)}
                          onChange={() => setSelected((s) => toggleOption(group, s, option.id))}
                          className="size-5 shrink-0 accent-orange-600 focus:outline-none"
                        />
                        {option.name}
                      </span>
                      {option.priceDeltaCents !== 0 && (
                        <span className="shrink-0 text-sm text-stone-600 tabular-nums">
                          {option.priceDeltaCents > 0 ? "+" : "−"}
                          {formatCents(Math.abs(option.priceDeltaCents))}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="border-t border-stone-100 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={!valid}
            onClick={() => onAdd(selected)}
            className={`${primaryButton} w-full`}
          >
            <span>
              Add — <span className="tabular-nums">{formatCents(unitPrice(item, selected))}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
