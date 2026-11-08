"use client";

import type { MenuItem } from "@slot-order/core";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Count } from "@/components/Count";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { focusRing, roundSurface, stepButton } from "@/components/ui";

// The control of a quick-add item (docs/design.md §11.9: a drink without a required group), the same on the grid
// and in the item page's "Add a drink" rows: the round "+" while the cart holds none of it, the "−" / count / "+"
// pill once it does. The control that appears enters (M5: opacity and scale 0.9 → 1, 150 ms; the pill grows from
// its right edge, the circle from its centre); the one that leaves unmounts at once. If focus was inside the
// control when it swaps, it moves to the new control's "+"; otherwise it stays where it is.

/** CartLine's quantity maximum (§7.1): the "+" is disabled there. */
const MAX_QUANTITY = 20;

const enter = "duration-150 ease-out-strong starting:opacity-0 motion-safe:starting:scale-90";

export function QuickAddControl({
  item,
  quantity,
  onAdd,
  onRemove,
  className = "",
}: {
  item: MenuItem;
  /** The cart's `itemQuantity` of the item. */
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  /** Placement (the grid: absolute in the tile's corner). */
  className?: string;
}) {
  const showPill = quantity > 0;
  const wrapRef = useRef<HTMLDivElement>(null);
  const roundRef = useRef<HTMLButtonElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  /** Whether focus was inside the control when a tap that swaps it was made. */
  const refocus = useRef(false);
  const shown = useRef(showPill);
  /** Entrances only after a swap, not when the control first mounts (the grid at load, the page's rows on open). */
  const mountedAs = useRef(showPill);
  const swapped = useRef(false);
  if (showPill !== mountedAs.current) swapped.current = true;

  useLayoutEffect(() => {
    if (shown.current === showPill) return;
    shown.current = showPill;
    if (refocus.current) (showPill ? plusRef : roundRef).current?.focus();
    refocus.current = false;
  }, [showPill]);

  // A tap that did not swap (the cart was full) leaves no stale note behind.
  useEffect(() => {
    refocus.current = false;
  });

  function noteFocus(): void {
    refocus.current = wrapRef.current?.contains(document.activeElement) ?? false;
  }

  return (
    <div ref={wrapRef} className={className}>
      {showPill ? (
        // biome-ignore lint/a11y/useSemanticElements: a 40 high inline pill, not a form section; a <fieldset> brings its own box quirks (§11.9 names role="group")
        <div
          role="group"
          aria-label={`${item.name}, ${quantity} in cart`}
          className={`inline-flex h-10 items-center rounded-full bg-white px-1 text-ink shadow-[0_1px_6px_rgba(0,0,0,0.18)] ${
            swapped.current ? `origin-right transition-[scale,opacity] ${enter}` : ""
          }`}
        >
          <button
            type="button"
            aria-label={`Remove one ${item.name}`}
            onClick={() => {
              if (quantity === 1) noteFocus();
              onRemove();
            }}
            className={stepButton}
          >
            <MinusIcon className="size-4" />
          </button>
          <span aria-hidden="true" className="min-w-4 text-center">
            <Count value={quantity} className="text-label tabular-nums" />
          </span>
          <button
            ref={plusRef}
            type="button"
            aria-label={`Add one ${item.name}`}
            disabled={quantity >= MAX_QUANTITY}
            onClick={onAdd}
            className={stepButton}
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      ) : (
        <button
          ref={roundRef}
          type="button"
          aria-label={`Add ${item.name}`}
          onClick={() => {
            noteFocus();
            onAdd();
          }}
          className={`size-9 ${roundSurface} transition-[transform,translate,scale,opacity] duration-150 ease-out-strong not-disabled:active:scale-[0.97] ${
            swapped.current ? `origin-center ${enter}` : ""
          } ${focusRing}`}
        >
          <PlusIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
