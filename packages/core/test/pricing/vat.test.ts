import { describe, expect, test } from "vitest";
import { type CartLine, type Menu, priceCart, splitVat } from "../../src/index";
import { line, seedItem, seedMenu, testCombo, withInactiveItem, withItem } from "../fixtures/menu";

// docs/design.md §7.4: per part net = round(gross × 100 / (100 + rate)), halves up, vat = gross − net; a plain
// line has one part, a combo line is allocated over its components' standalone values and summed per category;
// the receipt's VAT summary sums the parts per rate, ascending. Seed menu: food 7 %, drink 19 %.

const food = (grossCents: number, netCents: number, vatCents: number) => ({
  category: "food",
  rate: 7,
  grossCents,
  netCents,
  vatCents,
});
const drink = (grossCents: number, netCents: number, vatCents: number) => ({
  category: "drink",
  rate: 19,
  grossCents,
  netCents,
  vatCents,
});
const vatLine = (rate: number, grossCents: number, netCents: number, vatCents: number) => ({
  rate,
  grossCents,
  netCents,
  vatCents,
});

/** The parts of the first line of `lines` priced against `menu`. */
function partsOf(lines: CartLine[], menu: Menu = seedMenu, promoCode?: string) {
  return priceCart(menu, { lines, promoCode }).lines[0]?.parts;
}

describe("splitVat (§7.4)", () => {
  test.each([
    { gross: 1, rate: 7, net: 1, vat: 0 },
    { gross: 1, rate: 19, net: 1, vat: 0 },
    { gross: 100, rate: 7, net: 93, vat: 7 },
    { gross: 100, rate: 19, net: 84, vat: 16 },
    { gross: 1000, rate: 7, net: 935, vat: 65 },
    { gross: 1000, rate: 19, net: 840, vat: 160 },
    { gross: 1999, rate: 7, net: 1868, vat: 131 },
    { gross: 1999, rate: 19, net: 1680, vat: 319 },
    { gross: 1290, rate: 7, net: 1206, vat: 84 },
    { gross: 1290, rate: 19, net: 1084, vat: 206 },
    { gross: 0, rate: 19, net: 0, vat: 0 },
  ])("$gross @ $rate % → net $net, vat $vat", ({ gross, rate, net, vat }) => {
    expect(splitVat(gross, rate)).toEqual({ netCents: net, vatCents: vat });
  });

  // An exact half cannot occur at 7 or 19 (107 and 119 share no factor with 200), so the rule is pinned at 100 %.
  test("rounds an exact half up: 3 @ 100 % → 300 / 200 = 1.5 → net 2, vat 1", () => {
    expect(splitVat(3, 100)).toEqual({ netCents: 2, vatCents: 1 });
  });

  test("a rate of 0: net = gross, vat 0", () => {
    expect(splitVat(250, 0)).toEqual({ netCents: 250, vatCents: 0 });
  });
});

describe("worked example 1 (§7.4): one burger-menu, no promo", () => {
  // Allocation of 1290 over 790 / 350 / 290 → 713 / 316 / 261 (amounts.test.ts): food 713 + 316 = 1029.
  test("one part per category, food first: food 1029 → 962 / 67, drink 261 → 219 / 42", () => {
    // SPEC: §7.4 does not order a combo's parts; pinned as the brief says, food first (for the seed combos the
    // component order, the category order and the rate order all agree).
    expect(partsOf([line("burger-menu")])).toEqual([food(1029, 962, 67), drink(261, 219, 42)]);
  });

  test("the receipt in full: subtotal 1290, discount 0, total 1290, VAT 7 % 67 on 1029, 19 % 42 on 261", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu")] });
    expect(receipt).toEqual({
      lines: [
        {
          itemId: "burger-menu",
          name: "Burger Menu",
          kind: "combo",
          optionNames: [],
          quantity: 1,
          unitGrossCents: 1290,
          lineGrossCents: 1290,
          discountCents: 0,
          parts: [food(1029, 962, 67), drink(261, 219, 42)],
        },
      ],
      itemCount: 1,
      subtotalCents: 1290,
      discountCents: 0,
      totalCents: 1290,
      vat: [vatLine(7, 1029, 962, 67), vatLine(19, 261, 219, 42)],
    });
    expect(receipt.promoCode).toBeUndefined();
  });
});

describe("worked example 2 (§7.4): one burger-menu with HAHN10", () => {
  // §7.4: 1161 over 790 / 350 / 290 → 641.39 / 284.16 / 235.45; floors 1160, the one cent to the drink (.45)
  // → 641 / 284 / 236.
  test("discount 129, the line's discountCents 129, total 1161", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu")], promoCode: "HAHN10" });
    expect(receipt).toMatchObject({
      subtotalCents: 1290,
      discountCents: 129,
      totalCents: 1161,
      promoCode: "HAHN10",
    });
    expect(receipt.lines[0]?.discountCents).toBe(129);
  });

  test("parts: food 641 + 284 = 925 → 864 / 61, drink 236 → 198 / 38", () => {
    expect(partsOf([line("burger-menu")], seedMenu, "HAHN10")).toEqual([
      food(925, 864, 61),
      drink(236, 198, 38),
    ]);
  });

  test("VAT summary: 7 % 61 on 925, 19 % 38 on 236", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu")], promoCode: "HAHN10" });
    expect(receipt.vat).toEqual([vatLine(7, 925, 864, 61), vatLine(19, 236, 198, 38)]);
  });
});

describe("combo parts (§7.4)", () => {
  // SPEC: the M2 brief gives 599 / 323 / 268, food 922 → 862 / 60, drink 268 → 225 / 43. By §7.3's rule the
  // two cents go to .87 (fries) and .61 (wings), not .52 (cola): 600 / 323 / 267. Pinned as the rule gives it.
  test("wings-menu: 1190 over 650 / 350 / 290 → 600 / 323 / 267; food 923 → 863 / 60, drink 267 → 224 / 43", () => {
    expect(partsOf([line("wings-menu")])).toEqual([food(923, 863, 60), drink(267, 224, 43)]);
  });

  test("weights are the components' standalone price × component quantity: a combo of 1000 = fries ×2 (700) + cola (290) → 707 / 293", () => {
    const menu = withItem(
      seedMenu,
      testCombo("test-combo", 1000, [
        { itemId: "fries", quantity: 2 },
        { itemId: "cola", quantity: 1 },
      ]),
    );
    expect(partsOf([line("test-combo")], menu)).toEqual([food(707, 661, 46), drink(293, 246, 47)]);
  });

  test("the line's discounted gross is allocated, not the unit's: burger-menu ×2 → 2580 over 790 / 350 / 290 → 1425 / 632 / 523", () => {
    // Per unit (713 / 316 / 261, doubled) would give food 2058, drink 522.
    expect(partsOf([line("burger-menu", { quantity: 2 })])).toEqual([
      food(2057, 1922, 135),
      drink(523, 439, 84),
    ]);
  });

  test("the parts sum to the line's discounted gross: burger-menu with WELCOME3 → 990 = 789 + 201", () => {
    const parts = partsOf([line("burger-menu")], seedMenu, "WELCOME3");
    expect(parts?.map((p) => p.grossCents)).toEqual([789, 201]);
  });

  test("a component's active flag is ignored: burger-menu with cola inactive prices as before", () => {
    const menu = withInactiveItem(seedMenu, "cola");
    expect(priceCart(menu, { lines: [line("burger-menu")] })).toEqual(
      priceCart(seedMenu, { lines: [line("burger-menu")] }),
    );
  });

  test("the combo's own vatCategory is ignored: burger-menu marked drink still splits food 1029 / drink 261", () => {
    const menu = withItem(seedMenu, { ...seedItem("burger-menu"), vatCategory: "drink" });
    expect(partsOf([line("burger-menu")], menu)).toEqual([
      food(1029, 962, 67),
      drink(261, 219, 42),
    ]);
  });

  test("a combo of one category yields one part: fries ×2 + coleslaw at 900 → food 900 → 841 / 59", () => {
    const menu = withItem(
      seedMenu,
      testCombo("test-food-combo", 900, [
        { itemId: "fries", quantity: 2 },
        { itemId: "coleslaw", quantity: 1 },
      ]),
    );
    expect(partsOf([line("test-food-combo")], menu)).toEqual([food(900, 841, 59)]);
  });
});

describe("plain item lines (§7.4)", () => {
  test("ayran 250 has exactly one part at its own category: drink 19 % 250 → 210 / 40", () => {
    expect(partsOf([line("ayran")])).toEqual([drink(250, 210, 40)]);
  });

  test("an option delta takes its item's category: chicken-burger large ×2 (1880) → one food part 1757 / 123", () => {
    expect(partsOf([line("chicken-burger", { options: ["burger-large"], quantity: 2 })])).toEqual([
      food(1880, 1757, 123),
    ]);
  });
});

describe("VAT summary (§7.4)", () => {
  test("sums the parts per rate, ascending: burger-menu + ayran → 7 % 1029 / 962 / 67, 19 % 511 / 429 / 82", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu"), line("ayran")] });
    expect(receipt.totalCents).toBe(1540);
    expect(receipt.vat).toEqual([vatLine(7, 1029, 962, 67), vatLine(19, 511, 429, 82)]);
  });

  test("ascending even when the drink line comes first: ayran + burger-menu gives the same summary", () => {
    const receipt = priceCart(seedMenu, { lines: [line("ayran"), line("burger-menu")] });
    expect(receipt.vat).toEqual([vatLine(7, 1029, 962, 67), vatLine(19, 511, 429, 82)]);
  });

  test("only rates present appear: an all-food cart (half-chicken) has one line, 7 % 890 / 832 / 58", () => {
    const receipt = priceCart(seedMenu, { lines: [line("half-chicken")] });
    expect(receipt.vat).toEqual([vatLine(7, 890, 832, 58)]);
  });

  test("never recomputed from the totals: two cola lines → 19 % 580 / 488 / 92 (splitVat(580, 19) would give 487 / 93)", () => {
    const receipt = priceCart(seedMenu, { lines: [line("cola"), line("cola")] });
    expect(receipt.vat).toEqual([vatLine(19, 580, 488, 92)]);
  });

  test("one line per rate, not per category: food and drink both at 19 % → one line 19 % 1290 / 1084 / 206", () => {
    const menu: Menu = { ...seedMenu, vatRates: { food: 19, drink: 19 } };
    const receipt = priceCart(menu, { lines: [line("burger-menu")] });
    expect(receipt.lines[0]?.parts).toEqual([
      { category: "food", rate: 19, grossCents: 1029, netCents: 865, vatCents: 164 },
      { category: "drink", rate: 19, grossCents: 261, netCents: 219, vatCents: 42 },
    ]);
    expect(receipt.vat).toEqual([vatLine(19, 1290, 1084, 206)]);
  });

  test("a part and a summary line of gross 0 are kept: WELCOME3 on one ayran → total 0, drink 19 % 0 / 0 / 0", () => {
    const receipt = priceCart(seedMenu, { lines: [line("ayran")], promoCode: "WELCOME3" });
    expect(receipt.totalCents).toBe(0);
    expect(receipt.lines[0]?.parts).toEqual([drink(0, 0, 0)]);
    expect(receipt.vat).toEqual([vatLine(19, 0, 0, 0)]);
  });
});

describe("rates come from the menu (§7.4)", () => {
  test("vatRates { food: 10, drink: 20 }: ayran 250 → net 208, vat 42 (25000 / 120 = 208.33)", () => {
    const menu: Menu = { ...seedMenu, vatRates: { food: 10, drink: 20 } };
    const receipt = priceCart(menu, { lines: [line("ayran")] });
    expect(receipt.lines[0]?.parts).toEqual([
      { category: "drink", rate: 20, grossCents: 250, netCents: 208, vatCents: 42 },
    ]);
    expect(receipt.vat).toEqual([vatLine(20, 250, 208, 42)]);
  });
});
