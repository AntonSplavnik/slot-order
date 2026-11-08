import type { Receipt } from "@slot-order/core";
import { formatCents } from "@/lib/money";

// A receipt as the order summary (docs/design.md §7.5, §11.6, §11.7): optionally its lines (the quantity in a
// small grey square), then rows 32 high: Subtotal and the discount in 16/20 `ink-2` (the discount green), the
// VAT lines in 14/20 `ink-3`, the Total in 18/24 700 `ink`.

function Row({
  label,
  cents,
  className,
  minus = false,
}: {
  label: string;
  cents: number;
  className: string;
  minus?: boolean;
}) {
  return (
    <div className={`flex min-h-8 items-center justify-between gap-3 ${className}`}>
      <span>{label}</span>
      <span className="shrink-0 tabular-nums">
        {minus ? "−" : ""}
        {formatCents(cents)}
      </span>
    </div>
  );
}

export function ReceiptView({ receipt, lines = false }: { receipt: Receipt; lines?: boolean }) {
  return (
    <div>
      {lines && (
        <ul className="mb-2 divide-y divide-line border-b border-line">
          {receipt.lines.map((line, i) => (
            // The receipt's lines have no id; the index is their identity within one receipt.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <li key={i} className="flex justify-between gap-3 py-3">
              <span className="flex min-w-0 gap-3">
                <span className="mt-px grid size-5 shrink-0 place-items-center rounded bg-well text-caption-strong tabular-nums">
                  {line.quantity}
                </span>
                <span className="min-w-0">
                  <span className="block text-body">{line.name}</span>
                  {line.optionNames.length > 0 && (
                    <span className="block text-body-sm text-ink-3">
                      {line.optionNames.join(", ")}
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-body tabular-nums">
                {formatCents(line.lineGrossCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Row label="Subtotal" cents={receipt.subtotalCents} className="text-body text-ink-2" />
      {receipt.discountCents > 0 && (
        <Row
          label={`Discount${receipt.promoCode === undefined ? "" : ` (${receipt.promoCode})`}`}
          cents={receipt.discountCents}
          minus
          className="text-body text-green-text"
        />
      )}
      {receipt.vat.map((vat) => (
        <Row
          key={vat.rate}
          label={`incl. ${vat.rate} % VAT on ${formatCents(vat.grossCents)}`}
          cents={vat.vatCents}
          className="text-body-sm text-ink-3"
        />
      ))}
      <Row label="Total" cents={receipt.totalCents} className="mt-2 text-total text-ink" />
    </div>
  );
}
