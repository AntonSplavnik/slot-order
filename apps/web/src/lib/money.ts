// Money on the screens (docs/design.md §11.1; amounts are integer cents, §7): one format everywhere, "12,90 €".

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** Integer cents as euros in the German format, e.g. 1290 → "12,90 €" (a no-break space before the sign). */
export function formatCents(cents: number): string {
  return EURO.format(cents / 100);
}
