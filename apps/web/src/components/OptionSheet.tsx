"use client";

import type { MenuItem } from "@slot-order/core";
import { useState } from "react";
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
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="sheet-title" className="text-lg font-semibold">
              {item.name}
            </h2>
            {item.description !== undefined && (
              <p className="text-sm text-stone-500">{item.description}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-sm text-stone-500">
            Close
          </button>
        </div>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto">
          {item.optionGroups.map((group) => {
            const radio = group.maxChoices === 1;
            const hint = radio
              ? group.minChoices === 0
                ? "Optional"
                : "Choose one"
              : `Up to ${group.maxChoices}${group.minChoices > 0 ? `, at least ${group.minChoices}` : ""}`;
            return (
              <fieldset key={group.id}>
                <legend className="mb-2 flex w-full justify-between text-sm font-medium">
                  <span>{group.name}</span>
                  <span className="font-normal text-stone-500">{hint}</span>
                </legend>
                <div className="space-y-1">
                  {group.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 px-3 py-2 has-checked:border-orange-600"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={radio ? "radio" : "checkbox"}
                          name={group.id}
                          checked={selected.includes(option.id)}
                          onChange={() => setSelected((s) => toggleOption(group, s, option.id))}
                          className="accent-orange-600"
                        />
                        {option.name}
                      </span>
                      {option.priceDeltaCents !== 0 && (
                        <span className="text-sm text-stone-500 tabular-nums">
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

        <button
          type="button"
          disabled={!valid}
          onClick={() => onAdd(selected)}
          className="mt-5 w-full rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white disabled:bg-stone-300"
        >
          Add · {formatCents(unitPrice(item, selected))}
        </button>
      </div>
    </div>
  );
}
