import { describe, expect, test } from "vitest";
import { allocate, itemCount, priceCart } from "../../src/index";
import { line, seedMenu, testItem, withBurgerSmall, withItem, withPromo } from "../fixtures/menu";

// docs/design.md §7.1 (itemCount), §7.3 (unit and line gross, subtotal, discount and its largest-remainder
// spread, total). Seed menu (test/fixtures/menu.ts) unless noted; all amounts in cents.

const BURGER_LARGE_GARLIC_CHILI_X2 = line("chicken-burger", {
  // Deliberately not in the menu's order: optionNames follow the menu, not the cart.
  options: ["sauce-chili", "burger-large", "sauce-garlic"],
  quantity: 2,
});

describe("unit and line gross (§7.3.1–2)", () => {
  test("chicken-burger large + garlic + chili ×2: unit 940, line 1880, option names in the menu's order", () => {
    const receipt = priceCart(seedMenu, { lines: [BURGER_LARGE_GARLIC_CHILI_X2] });
    expect(receipt.lines[0]).toMatchObject({
      itemId: "chicken-burger",
      name: "Chicken Burger",
      kind: "item",
      optionNames: ["large", "garlic", "chili"],
      quantity: 2,
      unitGrossCents: 940,
      lineGrossCents: 1880,
      discountCents: 0,
    });
  });

  test("a delta of 0: chicken-burger regular, unit 790", () => {
    const receipt = priceCart(seedMenu, {
      lines: [line("chicken-burger", { options: ["burger-regular"] })],
    });
    expect(receipt.lines[0]).toMatchObject({
      optionNames: ["regular"],
      unitGrossCents: 790,
      lineGrossCents: 790,
    });
  });

  test("a positive delta: fries large ×3, unit 450, line 1350", () => {
    const receipt = priceCart(seedMenu, {
      lines: [line("fries", { options: ["fries-large"], quantity: 3 })],
    });
    expect(receipt.lines[0]).toMatchObject({
      name: "Fries",
      optionNames: ["large"],
      unitGrossCents: 450,
      lineGrossCents: 1350,
    });
  });

  test("a negative delta: a −100 size on chicken-burger ×2, unit 690, line 1380", () => {
    const receipt = priceCart(withBurgerSmall(-100), {
      lines: [line("chicken-burger", { options: ["burger-small"], quantity: 2 })],
    });
    expect(receipt.lines[0]).toMatchObject({
      optionNames: ["small"],
      unitGrossCents: 690,
      lineGrossCents: 1380,
    });
  });

  test("an item without options: half-chicken ×3, unit 890, line 2670, no option names", () => {
    const receipt = priceCart(seedMenu, { lines: [line("half-chicken", { quantity: 3 })] });
    expect(receipt.lines[0]).toMatchObject({
      itemId: "half-chicken",
      name: "Halbes Hähnchen",
      kind: "item",
      optionNames: [],
      quantity: 3,
      unitGrossCents: 890,
      lineGrossCents: 2670,
    });
  });

  test("a combo: burger-menu ×2, unit 1290, line 2580, kind combo", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu", { quantity: 2 })] });
    expect(receipt.lines[0]).toMatchObject({
      itemId: "burger-menu",
      name: "Burger Menu",
      kind: "combo",
      optionNames: [],
      quantity: 2,
      unitGrossCents: 1290,
      lineGrossCents: 2580,
    });
  });

  test("the receipt keeps the cart's line order", () => {
    const receipt = priceCart(seedMenu, {
      lines: [line("water"), line("burger-menu"), line("half-chicken")],
    });
    expect(receipt.lines.map((l) => l.itemId)).toEqual(["water", "burger-menu", "half-chicken"]);
  });
});

describe("itemCount (§7.1): Σ quantity, a combo counting as one item", () => {
  const cart = {
    lines: [
      line("chicken-burger", { options: ["burger-regular"], quantity: 2 }),
      line("burger-menu", { quantity: 1 }),
    ],
  };

  test("chicken-burger ×2 and burger-menu ×1 → 3", () => {
    expect(itemCount(cart)).toBe(3);
  });

  test("the receipt carries the same itemCount, 3", () => {
    expect(priceCart(seedMenu, cart).itemCount).toBe(3);
  });
});

describe("allocate (§7.3.3): floors, then the leftover cents to the largest remainders, ties to the earlier", () => {
  test.each([
    {
      total: 1290,
      weights: [790, 350, 290],
      expected: [713, 316, 261],
      why: "712.66 / 315.73 / 261.61: the two cents to .73, then .66",
    },
    {
      total: 50,
      weights: [333, 333, 334],
      expected: [17, 16, 17],
      why: "16.65 / 16.65 / 16.70: the .70 first, then the earlier .65",
    },
    { total: 200, weights: [1500, 500], expected: [150, 50], why: "exact" },
    { total: 0, weights: [1, 2], expected: [0, 0], why: "nothing to spread" },
    { total: 5, weights: [1], expected: [5], why: "a single weight takes it all" },
    // SPEC: the M2 brief gives 599 / 323 / 268 here ("fries then cola"), but by §7.3's rule the two cents go
    // to the largest remainders, .87 (fries) and .61 (wings), not .52 (cola). Pinned as the rule gives it.
    {
      total: 1190,
      weights: [650, 350, 290],
      expected: [600, 323, 267],
      why: "599.61 / 322.87 / 267.52: the two cents to .87, then .61 (wings-menu)",
    },
  ])("allocate($total, $weights) → $expected ($why)", ({ total, weights, expected }) => {
    expect(allocate(total, weights)).toEqual(expected);
  });

  // SPEC: §7.3 says "if every weight is 0, the shares go to the earliest lines one cent each", which does not
  // say what happens when total exceeds the number of weights; pinned as the brief reads it: one cent each to
  // the earliest, round robin.
  test("allocate(3, [0, 0]) → [2, 1]: all weights 0, one cent each to the earliest, round robin", () => {
    expect(allocate(3, [0, 0])).toEqual([2, 1]);
  });

  test("allocate(1, [0, 0, 0]) → [1, 0, 0]: all weights 0, the cent goes to the earliest", () => {
    expect(allocate(1, [0, 0, 0])).toEqual([1, 0, 0]);
  });

  test("a weight of 0 among others gets nothing: allocate(10, [0, 1, 1]) → [0, 5, 5]", () => {
    expect(allocate(10, [0, 1, 1])).toEqual([0, 5, 5]);
  });

  test("the shares always sum to the total", () => {
    for (const [total, weights] of [
      [1290, [790, 350, 290]],
      [50, [333, 333, 334]],
      [3, [0, 0]],
      [7, [1, 1, 1]],
      [99, [5, 0, 3, 8]],
    ] as const) {
      const shares = allocate(total, [...weights]);
      expect(shares).toHaveLength(weights.length);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe("discount (§7.3.3)", () => {
  test("HAHN10 on one line of 1255: discount 126 (125.5 rounds up), total 1129", () => {
    const menu = withItem(seedMenu, testItem("test-1255", 1255));
    const receipt = priceCart(menu, { lines: [line("test-1255")], promoCode: "HAHN10" });
    expect(receipt).toMatchObject({ subtotalCents: 1255, discountCents: 126, totalCents: 1129 });
    expect(receipt.lines[0]?.discountCents).toBe(126);
  });

  test("HAHN10 on lines of 1500 (ayran ×6) and 500 (water ×2): discount 200, spread 150 / 50", () => {
    const receipt = priceCart(seedMenu, {
      lines: [line("ayran", { quantity: 6 }), line("water", { quantity: 2 })],
      promoCode: "HAHN10",
    });
    expect(receipt.lines.map((l) => l.lineGrossCents)).toEqual([1500, 500]);
    expect(receipt.lines.map((l) => l.discountCents)).toEqual([150, 50]);
    expect(receipt).toMatchObject({ subtotalCents: 2000, discountCents: 200, totalCents: 1800 });
  });

  test("a 5 % code over lines of 333 / 333 / 334: discount 50, spread 17 / 16 / 17", () => {
    let menu = withPromo(seedMenu, { code: "FIVE", kind: "percent", value: 5, active: true });
    menu = withItem(menu, testItem("test-333a", 333));
    menu = withItem(menu, testItem("test-333b", 333));
    menu = withItem(menu, testItem("test-334", 334));
    const receipt = priceCart(menu, {
      lines: [line("test-333a"), line("test-333b"), line("test-334")],
      promoCode: "FIVE",
    });
    expect(receipt.discountCents).toBe(50);
    expect(receipt.lines.map((l) => l.discountCents)).toEqual([17, 16, 17]);
    expect(receipt.totalCents).toBe(950);
  });

  test("WELCOME3 (300 off) on a subtotal of 250 (ayran): discount 250, total 0, never below 0", () => {
    const receipt = priceCart(seedMenu, { lines: [line("ayran")], promoCode: "WELCOME3" });
    expect(receipt).toMatchObject({ subtotalCents: 250, discountCents: 250, totalCents: 0 });
    expect(receipt.lines[0]?.discountCents).toBe(250);
  });

  test("WELCOME3 on 1290 (burger-menu): discount 300, total 990", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu")], promoCode: "WELCOME3" });
    expect(receipt).toMatchObject({ subtotalCents: 1290, discountCents: 300, totalCents: 990 });
    expect(receipt.lines[0]?.discountCents).toBe(300);
  });

  test("the receipt's promoCode is the canonical HAHN10 when sent as ' hahn10 '", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu")], promoCode: " hahn10 " });
    expect(receipt.promoCode).toBe("HAHN10");
  });

  test("the receipt's promoCode is WELCOME3 when sent as WELCOME3", () => {
    const receipt = priceCart(seedMenu, { lines: [line("ayran")], promoCode: "WELCOME3" });
    expect(receipt.promoCode).toBe("WELCOME3");
  });

  test("without a promo every line's discountCents is 0", () => {
    const receipt = priceCart(seedMenu, {
      lines: [line("burger-menu"), line("ayran", { quantity: 3 })],
    });
    expect(receipt.discountCents).toBe(0);
    expect(receipt.lines.map((l) => l.discountCents)).toEqual([0, 0]);
  });
});

describe("subtotal and total (§7.3.2, §7.3.4)", () => {
  // chicken-burger large + garlic + chili ×2 (1880), burger-menu (1290), ayran (250): subtotal 3420.
  const lines = [BURGER_LARGE_GARLIC_CHILI_X2, line("burger-menu"), line("ayran")];

  test("subtotalCents = Σ line gross: 1880 + 1290 + 250 = 3420", () => {
    const receipt = priceCart(seedMenu, { lines });
    expect(receipt.lines.map((l) => l.lineGrossCents)).toEqual([1880, 1290, 250]);
    expect(receipt).toMatchObject({ subtotalCents: 3420, discountCents: 0, totalCents: 3420 });
  });

  test("HAHN10: discount 342 spread 188 / 129 / 25, total 3078", () => {
    const receipt = priceCart(seedMenu, { lines, promoCode: "HAHN10" });
    expect(receipt.lines.map((l) => l.discountCents)).toEqual([188, 129, 25]);
    expect(receipt).toMatchObject({ subtotalCents: 3420, discountCents: 342, totalCents: 3078 });
  });

  test("WELCOME3: 300 spread 165 / 113 / 22 (164.91 / 113.16 / 21.93), total 3120 = Σ (line gross − line discount)", () => {
    const receipt = priceCart(seedMenu, { lines, promoCode: "WELCOME3" });
    expect(receipt.lines.map((l) => l.discountCents)).toEqual([165, 113, 22]);
    expect(receipt).toMatchObject({ subtotalCents: 3420, discountCents: 300, totalCents: 3120 });
    const discounted = receipt.lines.map((l) => l.lineGrossCents - l.discountCents);
    expect(discounted).toEqual([1715, 1177, 228]);
    expect(discounted.reduce((a, b) => a + b, 0)).toBe(receipt.totalCents);
  });
});
