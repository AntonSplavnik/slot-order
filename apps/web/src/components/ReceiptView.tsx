import type { Receipt } from "@slot-order/core";
import { formatCents } from "@/lib/money";

// A receipt (docs/design.md §7.5): its lines, the discount, the total and the VAT lines.

export function ReceiptView({ receipt }: { receipt: Receipt }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {receipt.lines.map((line, i) => (
          // The receipt's lines have no id; the index is their identity within one receipt.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <li key={i} className="flex justify-between gap-3">
            <span className="min-w-0">
              <span className="tabular-nums">{line.quantity} ×</span> {line.name}
              {line.optionNames.length > 0 && (
                <span className="block text-sm text-stone-600">{line.optionNames.join(", ")}</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{formatCents(line.lineGrossCents)}</span>
          </li>
        ))}
      </ul>
      {receipt.discountCents > 0 && (
        <div className="flex justify-between gap-3 text-orange-700">
          <span>Discount{receipt.promoCode === undefined ? "" : ` (${receipt.promoCode})`}</span>
          <span className="tabular-nums">−{formatCents(receipt.discountCents)}</span>
        </div>
      )}
      <div className="flex justify-between gap-3 border-t border-stone-200 pt-3 text-lg font-bold">
        <span>Total</span>
        <span className="tabular-nums">{formatCents(receipt.totalCents)}</span>
      </div>
      <ul className="space-y-0.5 text-sm text-stone-600">
        {receipt.vat.map((vat) => (
          <li key={vat.rate} className="flex justify-between gap-3">
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
