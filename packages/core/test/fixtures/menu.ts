import type {
  CartLine,
  ComboComponent,
  Menu,
  MenuItem,
  Option,
  PromoCode,
  VatCategory,
} from "../../src/index";

// The Goldhahn menu of docs/design.md §5 Seed, for the pricing tests (docs/handoffs/m2-pricing-tests.md):
// the ids of §5, gross prices in cents, the seed's VAT rates. Variants are derived with the helpers below,
// never by copying the menu. Everything here is deep-frozen: pricing is a pure function (§4), so an
// implementation that mutates its input fails loudly instead of leaking into the next test.

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** A plain item: no option groups, no components, active. */
function plainItem(
  fields: Pick<MenuItem, "id" | "name" | "priceCents" | "vatCategory" | "sort"> &
    Partial<Pick<MenuItem, "optionGroups">>,
): MenuItem {
  return { kind: "item", active: true, optionGroups: [], components: [], ...fields };
}

/** A combo: no option groups, active. */
function comboItem(
  fields: Pick<MenuItem, "id" | "name" | "priceCents" | "sort" | "components">,
): MenuItem {
  // SPEC: §5 gives a combo's VAT as "split" (§7.4 splits it by its components), but `MenuItemSchema`
  // requires `vatCategory` on every row. The fixture says "food"; vat.test.ts pins that pricing ignores it.
  return { kind: "combo", vatCategory: "food", active: true, optionGroups: [], ...fields };
}

export const seedMenu: Menu = deepFreeze({
  items: [
    plainItem({
      id: "half-chicken",
      name: "Halbes Hähnchen",
      priceCents: 890,
      vatCategory: "food",
      sort: 1,
    }),
    plainItem({
      id: "chicken-burger",
      name: "Chicken Burger",
      priceCents: 790,
      vatCategory: "food",
      sort: 2,
      optionGroups: [
        {
          id: "chicken-burger-size",
          name: "Size",
          minChoices: 1,
          maxChoices: 1,
          options: [
            { id: "burger-regular", name: "regular", priceDeltaCents: 0 },
            { id: "burger-large", name: "large", priceDeltaCents: 150 },
          ],
        },
        {
          id: "chicken-burger-sauce",
          name: "Sauce",
          minChoices: 0,
          maxChoices: 2,
          options: [
            { id: "sauce-garlic", name: "garlic", priceDeltaCents: 0 },
            { id: "sauce-chili", name: "chili", priceDeltaCents: 0 },
            { id: "sauce-honey-mustard", name: "honey mustard", priceDeltaCents: 0 },
          ],
        },
      ],
    }),
    plainItem({
      id: "chicken-wings",
      name: "Chicken Wings, 6 pieces",
      priceCents: 650,
      vatCategory: "food",
      sort: 3,
      optionGroups: [
        {
          id: "chicken-wings-heat",
          name: "Heat",
          minChoices: 1,
          maxChoices: 1,
          options: [
            { id: "wings-mild", name: "mild", priceDeltaCents: 0 },
            { id: "wings-hot", name: "hot", priceDeltaCents: 0 },
          ],
        },
      ],
    }),
    plainItem({
      id: "fries",
      name: "Fries",
      priceCents: 350,
      vatCategory: "food",
      sort: 4,
      optionGroups: [
        {
          id: "fries-size",
          name: "Size",
          minChoices: 1,
          maxChoices: 1,
          options: [
            { id: "fries-regular", name: "regular", priceDeltaCents: 0 },
            { id: "fries-large", name: "large", priceDeltaCents: 100 },
          ],
        },
      ],
    }),
    plainItem({ id: "coleslaw", name: "Coleslaw", priceCents: 290, vatCategory: "food", sort: 5 }),
    plainItem({ id: "ayran", name: "Ayran", priceCents: 250, vatCategory: "drink", sort: 6 }),
    plainItem({ id: "cola", name: "Cola 0.33 l", priceCents: 290, vatCategory: "drink", sort: 7 }),
    plainItem({ id: "water", name: "Water 0.5 l", priceCents: 250, vatCategory: "drink", sort: 8 }),
    comboItem({
      id: "burger-menu",
      name: "Burger Menu",
      priceCents: 1290,
      sort: 9,
      components: [
        { itemId: "chicken-burger", quantity: 1 },
        { itemId: "fries", quantity: 1 },
        { itemId: "cola", quantity: 1 },
      ],
    }),
    comboItem({
      id: "wings-menu",
      name: "Wings Menu",
      priceCents: 1190,
      sort: 10,
      components: [
        { itemId: "chicken-wings", quantity: 1 },
        { itemId: "fries", quantity: 1 },
        { itemId: "cola", quantity: 1 },
      ],
    }),
  ],
  promoCodes: [
    { code: "HAHN10", kind: "percent", value: 10, active: true },
    { code: "WELCOME3", kind: "fixed", value: 300, active: true },
    { code: "OLD", kind: "percent", value: 50, active: false },
  ],
  vatRates: { food: 7, drink: 19 },
});

/** The seed item with this id; throws on a typo, so a fixture mistake cannot pass silently. */
export function seedItem(id: string): MenuItem {
  const item = seedMenu.items.find((i) => i.id === id);
  if (item === undefined) throw new Error(`no seed item ${id}`);
  return item;
}

/** A plain active test item without options (sorted after the seed). */
export function testItem(
  id: string,
  priceCents: number,
  vatCategory: VatCategory = "food",
): MenuItem {
  return plainItem({ id, name: `Test ${id}`, priceCents, vatCategory, sort: 100 });
}

/** An active test combo of `components` (sorted after the seed). */
export function testCombo(id: string, priceCents: number, components: ComboComponent[]): MenuItem {
  return comboItem({ id, name: `Test ${id}`, priceCents, sort: 100, components });
}

/** `menu` with `item` in place of the item with the same id, or added at the end. */
export function withItem(menu: Menu, item: MenuItem): Menu {
  const replaced = menu.items.some((i) => i.id === item.id);
  const items = replaced
    ? menu.items.map((i) => (i.id === item.id ? item : i))
    : [...menu.items, item];
  return deepFreeze({ ...menu, items });
}

/** `menu` with the item `id` set inactive. */
export function withInactiveItem(menu: Menu, id: string): Menu {
  const item = menu.items.find((i) => i.id === id);
  if (item === undefined) throw new Error(`no item ${id}`);
  return withItem(menu, { ...item, active: false });
}

/** `menu` with `option` added at the end of the option group `groupId`. */
export function withOption(menu: Menu, groupId: string, option: Option): Menu {
  const item = menu.items.find((i) => i.optionGroups.some((g) => g.id === groupId));
  if (item === undefined) throw new Error(`no option group ${groupId}`);
  return withItem(menu, {
    ...item,
    optionGroups: item.optionGroups.map((g) =>
      g.id === groupId ? { ...g, options: [...g.options, option] } : g,
    ),
  });
}

/** The seed with a third burger size, `burger-small` ("small"), at `deltaCents` (e.g. −800 or −100). */
export function withBurgerSmall(deltaCents: number): Menu {
  return withOption(seedMenu, "chicken-burger-size", {
    id: "burger-small",
    name: "small",
    priceDeltaCents: deltaCents,
  });
}

/** `menu` with `promo` in place of the code with the same `code`, or added at the end. */
export function withPromo(menu: Menu, promo: PromoCode): Menu {
  const promoCodes = menu.promoCodes.some((p) => p.code === promo.code)
    ? menu.promoCodes.map((p) => (p.code === promo.code ? promo : p))
    : [...menu.promoCodes, promo];
  return deepFreeze({ ...menu, promoCodes });
}

/** A cart line: no options and quantity 1 unless given. */
export function line(
  itemId: string,
  { options = [], quantity = 1 }: { options?: string[]; quantity?: number } = {},
): CartLine {
  return { itemId, quantity, optionIds: options };
}
