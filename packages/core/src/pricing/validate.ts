import type { Cart, CartErrorCode, CartLine } from "../schemas/cart";
import type { Menu, MenuItem, Option, OptionGroup, PromoCode } from "../schemas/menu";
import { CartError } from "./errors";
import { sum } from "./integers";

// Validation (docs/design.md §7.2): the first error in the order of §7.2 wins, every check of one line
// before any check of the next, the promo code last.

const MAX_LINES = 30;
const MAX_QUANTITY = 20;

/** A cart line that passed §7.2: its menu item, the chosen options in the menu's order, its unit gross. */
export interface ValidLine {
  item: MenuItem;
  options: Option[];
  quantity: number;
  unitGrossCents: number;
}

/** A cart that passed §7.2, with the promo it names, if any. */
export interface ValidCart {
  lines: ValidLine[];
  promo: PromoCode | undefined;
}

/** Checks `cart` against `menu` in the order of §7.2; throws the first `CartError`. */
export function validateCart(menu: Menu, cart: Cart): ValidCart {
  if (cart.lines.length === 0) throw new CartError("empty_cart");
  if (cart.lines.length > MAX_LINES) throw new CartError("too_many_lines");
  const lines = cart.lines.map((cartLine, index) => validateLine(menu, cartLine, index));
  return { lines, promo: findPromo(menu, cart.promoCode) };
}

/** The line checks of §7.2, in order, for the line at `index`. */
function validateLine(menu: Menu, cartLine: CartLine, index: number): ValidLine {
  const item = menu.items.find((candidate) => candidate.id === cartLine.itemId);
  if (item === undefined) throw new CartError("unknown_item", index);
  if (!item.active) throw new CartError("item_inactive", index);
  const optionError = optionsError(item, cartLine.optionIds);
  if (optionError !== undefined) throw new CartError(optionError, index);
  if (!isAllowedQuantity(cartLine.quantity)) throw new CartError("quantity_out_of_range", index);
  const options = chosenOptions(item, cartLine.optionIds);
  const unitGrossCents = unitGross(item, options);
  if (unitGrossCents < 0) throw new CartError("invalid_price", index);
  return { item, options, quantity: cartLine.quantity, unitGrossCents };
}

/** The first of options_on_combo, unknown_option, duplicate_option, option_count that applies (§7.2). */
function optionsError(item: MenuItem, optionIds: readonly string[]): CartErrorCode | undefined {
  if (item.kind === "combo") return optionIds.length > 0 ? "options_on_combo" : undefined;
  const known = new Set(item.optionGroups.flatMap((group) => group.options.map((o) => o.id)));
  if (optionIds.some((id) => !known.has(id))) return "unknown_option";
  const chosen = new Set(optionIds);
  if (chosen.size !== optionIds.length) return "duplicate_option";
  if (!item.optionGroups.every((group) => isWithinChoices(group, chosen))) return "option_count";
  return undefined;
}

/** The group's chosen options number within `[minChoices, maxChoices]`. */
function isWithinChoices(group: OptionGroup, chosen: ReadonlySet<string>): boolean {
  const count = group.options.filter((option) => chosen.has(option.id)).length;
  return count >= group.minChoices && count <= group.maxChoices;
}

function isAllowedQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY;
}

/** The chosen options in the menu's group and option order, whatever the cart's order. */
function chosenOptions(item: MenuItem, optionIds: readonly string[]): Option[] {
  const chosen = new Set(optionIds);
  return item.optionGroups.flatMap((group) => group.options.filter((o) => chosen.has(o.id)));
}

/** §7.3.1: the item's `priceCents` + the chosen options' `priceDeltaCents`. */
function unitGross(item: MenuItem, options: readonly Option[]): number {
  return item.priceCents + sum(options.map((option) => option.priceDeltaCents));
}

/** The active promo `promoCode` names, trimmed and case-insensitive; blank means none (§7.2). */
function findPromo(menu: Menu, promoCode: string | undefined): PromoCode | undefined {
  const code = (promoCode ?? "").trim().toUpperCase();
  if (code === "") return undefined;
  const promo = menu.promoCodes.find((candidate) => candidate.code === code);
  if (promo === undefined || !promo.active) throw new CartError("promo_invalid");
  return promo;
}
