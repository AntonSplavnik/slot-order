import type { Menu, MenuItem, VatCategory, VatRates } from "../schemas/menu";
import { VatCategorySchema } from "../schemas/menu";
import type { VatLine, VatPart } from "../schemas/receipt";
import { allocateOver } from "./allocate";
import { roundHalfUp, sum } from "./integers";

// VAT (docs/design.md §7.4): parts per line, split per part, summed per rate for the receipt.

/** net = round(gross × 100 / (100 + rate)), halves up, integers only; vat = gross − net (§7.4). */
export function splitVat(grossCents: number, rate: number): { netCents: number; vatCents: number } {
  const netCents = roundHalfUp(grossCents * 100, 100 + rate);
  return { netCents, vatCents: grossCents - netCents };
}

/** A line's parts (§7.4): one for a plain item; a combo's split over its components, per category. */
export function lineParts(menu: Menu, item: MenuItem, discountedGrossCents: number): VatPart[] {
  if (item.kind === "item") return [vatPart(menu.vatRates, item.vatCategory, discountedGrossCents)];
  return comboParts(menu, item, discountedGrossCents);
}

/**
 * A combo line's discounted gross allocated over its components' standalone values (price × quantity,
 * `active` ignored), then summed per category, food before drink. The combo's own `vatCategory` is ignored.
 */
function comboParts(menu: Menu, combo: MenuItem, discountedGrossCents: number): VatPart[] {
  const components = combo.components.map((component) => ({
    item: componentItem(menu, combo, component.itemId),
    quantity: component.quantity,
  }));
  const shares = allocateOver(
    discountedGrossCents,
    components,
    (component) => component.item.priceCents * component.quantity,
  );
  return VatCategorySchema.options.flatMap((category) => {
    const inCategory = shares.filter(([component]) => component.item.vatCategory === category);
    if (inCategory.length === 0) return [];
    return [vatPart(menu.vatRates, category, sum(inCategory.map(([, cents]) => cents)))];
  });
}

/** The menu item a combo component names; the menu's own integrity, not the cart's (no CartError). */
function componentItem(menu: Menu, combo: MenuItem, itemId: string): MenuItem {
  const item = menu.items.find((candidate) => candidate.id === itemId);
  if (item === undefined) {
    throw new Error(`combo ${combo.id}: component ${itemId} is not on the menu`);
  }
  return item;
}

function vatPart(rates: VatRates, category: VatCategory, grossCents: number): VatPart {
  const rate = rates[category];
  return { category, rate, grossCents, ...splitVat(grossCents, rate) };
}

/** The receipt's VAT summary (§7.4): one line per rate present, ascending, each the sum of its parts. */
export function vatSummary(parts: readonly VatPart[]): VatLine[] {
  const rates = [...new Set(parts.map((part) => part.rate))].sort((a, b) => a - b);
  return rates.map((rate) => {
    const atRate = parts.filter((part) => part.rate === rate);
    return {
      rate,
      grossCents: sum(atRate.map((part) => part.grossCents)),
      netCents: sum(atRate.map((part) => part.netCents)),
      vatCents: sum(atRate.map((part) => part.vatCents)),
    };
  });
}
