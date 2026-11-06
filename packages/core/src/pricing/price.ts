import type { Cart } from "../schemas/cart";
import type { Menu, PromoCode } from "../schemas/menu";
import type { PricedLine, Receipt } from "../schemas/receipt";
import { allocateOver } from "./allocate";
import { roundHalfUp, sum } from "./integers";
import { type ValidLine, validateCart } from "./validate";
import { lineParts, vatSummary } from "./vat";

// Amounts (docs/design.md §7.3) and the receipt (§7.5).

/** Prices a cart against the menu (§7.3–§7.5); throws `CartError` (§7.2). */
export function priceCart(menu: Menu, cart: Cart): Receipt {
  const { lines, promo } = validateCart(menu, cart);
  const subtotalCents = sum(lines.map(lineGross));
  const discountCents = discount(promo, subtotalCents);
  const pricedLines = allocateOver(discountCents, lines, lineGross).map(([line, share]) =>
    pricedLine(menu, line, share),
  );
  return {
    lines: pricedLines,
    itemCount: itemCount(cart),
    subtotalCents,
    discountCents,
    ...(promo === undefined ? {} : { promoCode: promo.code }),
    totalCents: subtotalCents - discountCents,
    vat: vatSummary(pricedLines.flatMap((line) => line.parts)),
  };
}

/** Σ quantity; a combo counts as one item (§7.1). */
export function itemCount(cart: Cart): number {
  return sum(cart.lines.map((line) => line.quantity));
}

/** §7.3.2: unit gross × quantity. */
function lineGross(line: ValidLine): number {
  return line.unitGrossCents * line.quantity;
}

/** §7.3.3: percent → round(subtotal × value / 100), halves up; fixed → min(value, subtotal). */
function discount(promo: PromoCode | undefined, subtotalCents: number): number {
  if (promo === undefined) return 0;
  const cents =
    promo.kind === "percent" ? roundHalfUp(subtotalCents * promo.value, 100) : promo.value;
  return Math.min(Math.max(cents, 0), subtotalCents);
}

/** A priced line (§7.5): its share of the discount, and the parts of its discounted gross (§7.4). */
function pricedLine(menu: Menu, line: ValidLine, discountCents: number): PricedLine {
  const lineGrossCents = lineGross(line);
  return {
    itemId: line.item.id,
    name: line.item.name,
    kind: line.item.kind,
    optionNames: line.options.map((option) => option.name),
    quantity: line.quantity,
    unitGrossCents: line.unitGrossCents,
    lineGrossCents,
    discountCents,
    parts: lineParts(menu, line.item, lineGrossCents - discountCents),
  };
}
