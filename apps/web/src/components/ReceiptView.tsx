import type { Receipt } from "@slot-order/core";
import { formatCents } from "@/lib/money";

// A receipt (docs/design.md §7.5): its lines, the discount, the total and the VAT lines.

export function ReceiptView({ receipt }: { receipt: Receipt }) {
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        {receipt.lines.map((line, i) => (
          // The receipt's lines have no id; the index is their identity within one receipt.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <li key={i} className="flex justify-between gap-3">
            <span>
              {line.quantity} × {line.name}
              {line.optionNames.length > 0 && (
                <span className="text-stone-500"> ({line.optionNames.join(", ")})</span>
              )}
            </span>
            <span className="tabular-nums">{formatCents(line.lineGrossCents)}</span>
          </li>
        ))}
      </ul>
      {receipt.discountCents > 0 && (
        <div className="flex justify-between text-stone-600">
          <span>Discount{receipt.promoCode === undefined ? "" : ` (${receipt.promoCode})`}</span>
          <span className="tabular-nums">−{formatCents(receipt.discountCents)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatCents(receipt.totalCents)}</span>
      </div>
      <ul className="space-y-0.5 text-xs text-stone-500">
        {receipt.vat.map((vat) => (
          <li key={vat.rate} className="flex justify-between">
            <span>
              incl. {vat.rate} % VAT on {formatCents(vat.grossCents)}
            </span>
            <span className="tabular-nums">{formatCents(vat.vatCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
