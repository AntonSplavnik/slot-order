import { type OptionGroup, priceCart } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { withBurgerSmall } from "../../../packages/core/test/fixtures/menu";
import {
  groupHint,
  optionNames,
  selectionValid,
  toggleOption,
  unitPrice,
} from "../src/lib/options";
import { group, item, line, seedMenu, toPublic } from "./helpers";

// docs/design.md §11.1 (the option sheet: radio for `maxChoices: 1`, checkboxes otherwise, Add only when
// every group is within its min and max) and §11.2 `options.ts`. The seed's Chicken Burger has Size
// (min 1, max 1: burger-regular +0, burger-large +150) and Sauce (min 0, max 2: sauce-garlic,
// sauce-chili, sauce-honey-mustard, each +0); Fries has Size (min 1, max 1: fries-large +100).

const size = group("chicken-burger", "chicken-burger-size");
const sauce = group("chicken-burger", "chicken-burger-sauce");
const burger = item("chicken-burger");
const fries = item("fries");
const cola = item("cola");

/** A frozen selection, so toggleOption cannot mutate it. */
function sel(...optionIds: string[]): readonly string[] {
  return Object.freeze(optionIds);
}

describe("toggleOption in a maxChoices: 1 group: radio semantics (§11.2)", () => {
  test("the first tap selects: [] → [burger-large]", () => {
    expect(toggleOption(size, sel(), "burger-large")).toEqual(["burger-large"]);
  });

  // SPEC: §11.2 says the tapped option replaces the group's choice but not where it lands in the
  // selection. Decision (the brief's): the other groups' ids stay in place, the old choice leaves, the
  // new one is appended.
  test("another option replaces the group's choice; other groups' ids stay", () => {
    expect(toggleOption(size, sel("burger-regular", "sauce-garlic"), "burger-large")).toEqual([
      "sauce-garlic",
      "burger-large",
    ]);
  });

  test("tapping the chosen option again keeps it", () => {
    expect(toggleOption(size, sel("burger-large", "sauce-garlic"), "burger-large")).toEqual([
      "burger-large",
      "sauce-garlic",
    ]);
  });

  // SPEC: §11.2 gives every maxChoices: 1 group radio semantics, minChoices 0 included, so an optional
  // single choice cannot be cleared once made. No seed group is like that; pinned as written.
  test("in an optional (min 0) max-1 group too, tapping the chosen option keeps it", () => {
    const optional = { ...size, minChoices: 0 };
    expect(toggleOption(optional, sel("burger-large"), "burger-large")).toEqual(["burger-large"]);
  });

  test.each(["sauce-garlic", "fries-large", "nope"])(
    "an id outside the group (%s) is refused: the selection unchanged",
    (optionId) => {
      expect(toggleOption(size, sel("burger-regular"), optionId)).toEqual(["burger-regular"]);
    },
  );
});

describe("toggleOption in a maxChoices > 1 group: checkboxes (§11.2)", () => {
  test("a tap adds; other groups' ids stay", () => {
    expect(toggleOption(sauce, sel("burger-large"), "sauce-garlic")).toEqual([
      "burger-large",
      "sauce-garlic",
    ]);
    expect(toggleOption(sauce, sel("burger-large", "sauce-garlic"), "sauce-chili")).toEqual([
      "burger-large",
      "sauce-garlic",
      "sauce-chili",
    ]);
  });

  test("a second tap removes it, the rest in their order", () => {
    expect(
      toggleOption(sauce, sel("burger-large", "sauce-garlic", "sauce-chili"), "sauce-garlic"),
    ).toEqual(["burger-large", "sauce-chili"]);
  });

  test("a choice beyond maxChoices is refused: the selection unchanged", () => {
    expect(
      toggleOption(
        sauce,
        sel("burger-large", "sauce-garlic", "sauce-chili"),
        "sauce-honey-mustard",
      ),
    ).toEqual(["burger-large", "sauce-garlic", "sauce-chili"]);
  });

  test("an id outside the group is refused", () => {
    expect(toggleOption(sauce, sel("sauce-garlic"), "burger-large")).toEqual(["sauce-garlic"]);
  });
});

describe("selectionValid: every group within [min, max], no unknown id, no id twice (§11.2)", () => {
  test.each<[string, string[]]>([
    ["a size and a sauce", ["burger-large", "sauce-garlic"]],
    ["a size and no sauce (Sauce is min 0)", ["burger-regular"]],
    ["a size and two sauces (Sauce is max 2)", ["burger-regular", "sauce-garlic", "sauce-chili"]],
    ["the ids in any order", ["sauce-garlic", "burger-large"]],
  ])("burger with %s → true", (_name, optionIds) => {
    expect(selectionValid(burger, optionIds)).toBe(true);
  });

  test.each<[string, string[]]>([
    ["nothing (Size is min 1)", []],
    ["two sizes (Size is max 1)", ["burger-large", "burger-regular", "sauce-garlic"]],
    [
      "three sauces (Sauce is max 2)",
      ["burger-large", "sauce-garlic", "sauce-chili", "sauce-honey-mustard"],
    ],
    ["an unknown id", ["burger-large", "sauce-garlic", "nope"]],
    ["another item's option", ["burger-large", "fries-large"]],
    ["the same id twice", ["burger-large", "sauce-garlic", "sauce-garlic"]],
  ])("burger with %s → false", (_name, optionIds) => {
    expect(selectionValid(burger, optionIds)).toBe(false);
  });

  test("an item without groups: [] → true, any id → false", () => {
    expect(selectionValid(cola, [])).toBe(true);
    expect(selectionValid(cola, ["x"])).toBe(false);
  });

  test("a combo has no groups: [] → true, an option → false", () => {
    expect(selectionValid(item("burger-menu"), [])).toBe(true);
    expect(selectionValid(item("burger-menu"), ["fries-large"])).toBe(false);
  });

  test("fries without a size → false, with one → true", () => {
    expect(selectionValid(fries, [])).toBe(false);
    expect(selectionValid(fries, ["fries-large"])).toBe(true);
  });
});

describe("optionNames: the chosen options' names in the menu's order (§11.2)", () => {
  test("Size before Sauce, whatever the selection's order: [large, garlic]", () => {
    expect(optionNames(burger, ["sauce-garlic", "burger-large"])).toEqual(["large", "garlic"]);
  });

  test("within a group, the group's order; the same names as core's receipt", () => {
    const optionIds = ["sauce-honey-mustard", "sauce-garlic", "burger-regular"];
    expect(optionNames(burger, optionIds)).toEqual(["regular", "garlic", "honey mustard"]);
    const priced = priceCart(seedMenu, { lines: [line("chicken-burger", { options: optionIds })] });
    expect(optionNames(burger, optionIds)).toEqual(priced.lines[0]?.optionNames);
  });

  test("no options → []", () => {
    expect(optionNames(cola, [])).toEqual([]);
  });
});

describe("unitPrice: the item's price plus the chosen deltas, in cents (§11.2, §7.3)", () => {
  test.each<[string, string[], number]>([
    ["chicken-burger", ["burger-large", "sauce-garlic"], 940],
    ["chicken-burger", ["burger-regular"], 790],
    ["fries", ["fries-large"], 450],
    ["cola", [], 290],
  ])("%s with %j → %i, as core's unitGrossCents", (itemId, optionIds, cents) => {
    expect(unitPrice(item(itemId), optionIds)).toBe(cents);
    const priced = priceCart(seedMenu, { lines: [line(itemId, { options: optionIds })] });
    expect(priced.lines[0]?.unitGrossCents).toBe(cents);
  });

  test("a negative delta lowers it: a small burger at −1.00 → 690", () => {
    const small = toPublic(withBurgerSmall(-100)).items.find((i) => i.id === "chicken-burger");
    if (small === undefined) throw new Error("no chicken-burger");
    expect(unitPrice(small, ["burger-small"])).toBe(690);
  });
});

// docs/design.md §11.2 `options.ts` and §11.9: the grey line under a group's name on the item page, moved out
// of the component into the library.

/** A schema-valid group with `count` options (at least `maxChoices`). */
function built(minChoices: number, maxChoices: number, count = maxChoices): OptionGroup {
  return {
    id: `g-${minChoices}-${maxChoices}`,
    name: "Built",
    minChoices,
    maxChoices,
    options: Array.from({ length: count }, (_, i) => ({
      id: `g-${minChoices}-${maxChoices}-${i}`,
      name: `option ${i}`,
      priceDeltaCents: 0,
    })),
  };
}

describe("groupHint (§11.2, §11.9)", () => {
  test('the seed\'s burger Size (1/1) → "Choose 1"', () => {
    expect(groupHint(size)).toBe("Choose 1");
  });

  test('the seed\'s Sauce (0/2) → "Choose up to 2"', () => {
    expect(groupHint(sauce)).toBe("Choose up to 2");
  });

  test('the seed\'s wings Heat (1/1) → "Choose 1"', () => {
    expect(groupHint(group("chicken-wings", "chicken-wings-heat"))).toBe("Choose 1");
  });

  test.each<[number, number, number, string]>([
    [1, 3, 3, "Pick at least 1, up to 3"],
    [2, 3, 4, "Pick at least 2, up to 3"],
    [2, 2, 2, "Choose 2"],
    [0, 1, 1, "Choose up to 1"],
    [0, 3, 5, "Choose up to 3"],
  ])("a built group %i/%i (%i options) → %s", (min, max, count, hint) => {
    expect(groupHint(built(min, max, count))).toBe(hint);
  });
});
