import type { PublicMenu } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { withInactiveItem } from "../../../packages/core/test/fixtures/menu";
import { itemById, menuSections } from "../src/lib/menu";
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
