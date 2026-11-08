import type { Receipt } from "@slot-order/core";
import { formatCents } from "@/lib/money";

// A receipt as the order summary (docs/design.md §7.5, §11.6): optionally its lines, then Subtotal, the
// discount, the VAT lines in grey and the Total in bold.

function Row({
  label,
  cents,
  className = "",
  minus = false,
}: {
  label: string;
  cents: number;
  className?: string;
  minus?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${className}`}>
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
    <div className="space-y-2">
      {lines && (
        <ul className="mb-3 divide-y divide-neutral-200 border-b border-neutral-200">
          {receipt.lines.map((line, i) => (
            // The receipt's lines have no id; the index is their identity within one receipt.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <li key={i} className="flex justify-between gap-3 py-2.5">
              <span className="flex min-w-0 gap-3">
                <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded bg-neutral-100 px-1 text-sm font-semibold tabular-nums">
                  {line.quantity}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{line.name}</span>
                  {line.optionNames.length > 0 && (
                    <span className="block text-sm text-neutral-500">
                      {line.optionNames.join(", ")}
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatCents(line.lineGrossCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <Row label="Subtotal" cents={receipt.subtotalCents} />
      {receipt.discountCents > 0 && (
        <Row
          label={`Discount${receipt.promoCode === undefined ? "" : ` (${receipt.promoCode})`}`}
          cents={receipt.discountCents}
          minus
          className="text-green-700"
        />
      )}
      {receipt.vat.map((vat) => (
        <Row
          key={vat.rate}
          label={`incl. ${vat.rate} % VAT on ${formatCents(vat.grossCents)}`}
          cents={vat.vatCents}
          className="text-sm text-neutral-500"
        />
      ))}
      <Row
        label="Total"
        cents={receipt.totalCents}
        className="border-t border-neutral-200 pt-3 text-lg font-bold"
      />
    </div>
  );
}
