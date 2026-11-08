import type { MenuItem, OptionGroup, PublicMenu } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { withInactiveItem, withItem } from "../../../packages/core/test/fixtures/menu";
import { itemById, menuSections, quickAdds, upsellItems } from "../src/lib/menu";
import { deepFreeze, item, publicMenu, seedMenu, toPublic } from "./helpers";

// docs/design.md §11.1 `/` and §11.2 `menu.ts`: three sections derived from the data, Food (`kind: item`,
// `vatCategory: food`), Drinks (`kind: item`, `vatCategory: drink`), Menus (`kind: combo`), items in `sort`
// order, inactive items hidden, sections without items omitted.

function ids(menu: PublicMenu): Record<string, string[]> {
  return Object.fromEntries(menuSections(menu).map((s) => [s.id, s.items.map((i) => i.id)]));
}

describe("menuSections on the seed (§11.1)", () => {
  test("three sections in the order food, drinks, menus, titled Food, Drinks, Menus", () => {
    expect(menuSections(publicMenu).map((s) => [s.id, s.title])).toEqual([
      ["food", "Food"],
      ["drinks", "Drinks"],
      ["menus", "Menus"],
    ]);
  });

  test("each section holds its items in sort order; the combos (stored as food) go to Menus only", () => {
    expect(ids(publicMenu)).toEqual({
      food: ["half-chicken", "chicken-burger", "chicken-wings", "fries", "coleslaw"],
      drinks: ["ayran", "cola", "water"],
      menus: ["burger-menu", "wings-menu"],
    });
  });

  test("the items are the menu's items, whole", () => {
    const food = menuSections(publicMenu)[0];
    expect(food?.items[1]).toEqual(item("chicken-burger"));
  });

  test("items given in reverse order still come sorted by `sort`", () => {
    const reversed = deepFreeze({ ...publicMenu, items: [...publicMenu.items].reverse() });
    expect(ids(reversed)).toEqual(ids(publicMenu));
    expect(ids(reversed).food).toEqual([
      "half-chicken",
      "chicken-burger",
      "chicken-wings",
      "fries",
      "coleslaw",
    ]);
  });
});

describe("menuSections hides inactive items and omits empty sections (§11.1, §11.2)", () => {
  test("an inactive coleslaw: Food has four items", () => {
    const menu = toPublic(withInactiveItem(seedMenu, "coleslaw"));
    expect(ids(menu).food).toEqual(["half-chicken", "chicken-burger", "chicken-wings", "fries"]);
  });

  test("a menu whose only drink is inactive has no Drinks section", () => {
    const onlyColaDrink = {
      ...seedMenu,
      items: seedMenu.items.filter((i) => i.vatCategory !== "drink" || i.id === "cola"),
    };
    const menu = toPublic(withInactiveItem(onlyColaDrink, "cola"));
    expect(menuSections(menu).map((s) => s.id)).toEqual(["food", "menus"]);
  });

  test("a menu with every item inactive has no sections", () => {
    const menu = toPublic({
      ...seedMenu,
      items: seedMenu.items.map((i) => ({ ...i, active: false })),
    });
    expect(menuSections(menu)).toEqual([]);
  });
});

describe("itemById (§11.2)", () => {
  test("finds the fries", () => {
    expect(itemById(publicMenu, "fries")).toEqual(item("fries"));
  });

  test("an unknown id → undefined", () => {
    expect(itemById(publicMenu, "nope")).toBeUndefined();
  });

  // SPEC: §11.2 does not say whether itemById sees inactive items. Decision: yes, it is a lookup, not
  // the menu screen's filter; the checkout can still name a stored line whose item went inactive.
  test("finds an inactive item too", () => {
    const menu = toPublic(withInactiveItem(seedMenu, "coleslaw"));
    expect(itemById(menu, "coleslaw")).toMatchObject({ id: "coleslaw", active: false });
  });
});

// docs/design.md §11.2 `menu.ts` and §11.9: a drink (`kind: item`, `vatCategory: drink`) without a required
// option group goes into the cart at once from the grid and from the item page's "Add a drink" rows; every
// other item opens the item page. `upsellItems` lists those drinks for any item that is not a drink. Every
// input here is deep-frozen (`publicMenu`, `toPublic`), so a function that mutates its input throws.

/** A one-option group, schema-valid (`maxChoices` ≤ the number of options). */
function oneOptionGroup(id: string, minChoices: number): OptionGroup {
  return {
    id,
    name: `Group ${id}`,
    minChoices,
    maxChoices: 1,
    options: [{ id: `${id}-only`, name: "only", priceDeltaCents: 0 }],
  };
}

/** The seed item `id` with `groups`. */
function withGroups(id: string, groups: OptionGroup[]): MenuItem {
  const found = seedMenu.items.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no seed item ${id}`);
  return { ...found, optionGroups: groups };
}

/** The seed where cola has a required group and water an optional one. */
const drinksWithGroups = toPublic(
  withItem(
    withItem(seedMenu, withGroups("cola", [oneOptionGroup("cola-size", 1)])),
    withGroups("water", [oneOptionGroup("water-ice", 0)]),
  ),
);

function drink(menu: PublicMenu, id: string): MenuItem {
  const found = menu.items.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no item ${id}`);
  return found;
}

describe("quickAdds: a drink without a required group (§11.2, §11.9)", () => {
  test.each(["ayran", "cola", "water"])("the seed drink %s → true", (id) => {
    expect(quickAdds(item(id))).toBe(true);
  });

  test.each(["half-chicken", "chicken-burger", "fries", "coleslaw"])(
    "the food item %s → false",
    (id) => {
      expect(quickAdds(item(id))).toBe(false);
    },
  );

  test.each(["burger-menu", "wings-menu"])("the combo %s → false", (id) => {
    expect(quickAdds(item(id))).toBe(false);
  });

  test("a drink with a required group (min 1) → false: it opens the item page", () => {
    expect(quickAdds(drink(drinksWithGroups, "cola"))).toBe(false);
  });

  test("a drink with only an optional group (min 0) → true", () => {
    expect(quickAdds(drink(drinksWithGroups, "water"))).toBe(true);
  });
});

describe('upsellItems: the item page\'s "Add a drink" rows (§11.2, §11.9)', () => {
  function upsellIds(menu: PublicMenu, itemId: string): string[] {
    return upsellItems(menu, drink(menu, itemId)).map((i) => i.id);
  }

  test("a food item → the three drinks in sort order", () => {
    expect(upsellIds(publicMenu, "chicken-burger")).toEqual(["ayran", "cola", "water"]);
    expect(upsellIds(publicMenu, "half-chicken")).toEqual(["ayran", "cola", "water"]);
  });

  test("a combo → the same three drinks", () => {
    expect(upsellIds(publicMenu, "burger-menu")).toEqual(["ayran", "cola", "water"]);
  });

  test("a drink → [] (never itself, never the other drinks)", () => {
    expect(upsellIds(publicMenu, "cola")).toEqual([]);
    expect(upsellIds(publicMenu, "ayran")).toEqual([]);
  });

  test("a drink with a required group → [] as well (it is still a drink)", () => {
    expect(upsellIds(drinksWithGroups, "cola")).toEqual([]);
  });

  test("an inactive drink is not listed", () => {
    const menu = toPublic(withInactiveItem(seedMenu, "cola"));
    expect(upsellIds(menu, "fries")).toEqual(["ayran", "water"]);
  });

  test("a drink with a required group is left out, one with an optional group stays", () => {
    expect(upsellIds(drinksWithGroups, "fries")).toEqual(["ayran", "water"]);
  });

  test("drinks given in reverse order still come in sort order", () => {
    const reversed = deepFreeze({ ...publicMenu, items: [...publicMenu.items].reverse() });
    expect(upsellIds(reversed, "coleslaw")).toEqual(["ayran", "cola", "water"]);
  });

  test("the rows are the menu's own item objects", () => {
    const rows = upsellItems(publicMenu, item("chicken-wings"));
    expect(rows[1]).toBe(publicMenu.items.find((i) => i.id === "cola"));
  });

  test("a menu without drinks → []", () => {
    const noDrinks = toPublic({
      ...seedMenu,
      items: seedMenu.items.filter((i) => i.vatCategory !== "drink"),
    });
    expect(upsellIds(noDrinks, "chicken-burger")).toEqual([]);
  });
});
