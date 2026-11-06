import { describe, expect, test } from "vitest";
import {
  type Cart,
  CartLineSchema,
  CartSchema,
  MenuItemSchema,
  MenuSchema,
  type OptionGroup,
  OptionGroupSchema,
  type PromoCode,
  PromoCodeSchema,
  type Receipt,
  ReceiptSchema,
  VatRatesSchema,
} from "../../src/index";
import { line, seedItem, seedMenu, testItem } from "../fixtures/menu";

// docs/design.md §7.6 (the menu's shape and what its schema enforces), §7.1 (the cart), §7.5 (the receipt),
// §13 "Schemas: every API shape round-trips its example". Each refusal changes one field of a value that is
// shown to parse, so a refusal cannot pass for an unrelated reason.

const SIZE_GROUP: OptionGroup = {
  id: "test-size",
  name: "Size",
  minChoices: 1,
  maxChoices: 1,
  options: [
    { id: "test-regular", name: "regular", priceDeltaCents: 0 },
    { id: "test-large", name: "large", priceDeltaCents: 150 },
  ],
};

const PERCENT: PromoCode = { code: "HAHN10", kind: "percent", value: 10, active: true };

const accepts = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(true);
const refuses = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(false);

describe("MenuSchema", () => {
  test("the seed menu parses unchanged", () => {
    expect(MenuSchema.parse(seedMenu)).toEqual(seedMenu);
  });
});

describe("MenuItemSchema: groups only on items, components only on combos (§7.6)", () => {
  test("accepts the seed's chicken-burger (an item with groups) and burger-menu (a combo with components)", () => {
    accepts(MenuItemSchema, seedItem("chicken-burger"));
    accepts(MenuItemSchema, seedItem("burger-menu"));
  });

  test("refuses a combo with option groups", () => {
    refuses(MenuItemSchema, { ...seedItem("burger-menu"), optionGroups: [SIZE_GROUP] });
  });

  test("refuses an item with components", () => {
    refuses(MenuItemSchema, {
      ...seedItem("fries"),
      components: [{ itemId: "cola", quantity: 1 }],
    });
  });

  test("refuses a combo without components", () => {
    refuses(MenuItemSchema, { ...seedItem("burger-menu"), components: [] });
  });

  test("refuses a negative price", () => {
    refuses(MenuItemSchema, { ...testItem("test-1", 100), priceCents: -1 });
  });
});

describe("OptionGroupSchema: min ≤ max ≤ options.length (§7.6)", () => {
  test("accepts a group of 1 of 2", () => {
    accepts(OptionGroupSchema, SIZE_GROUP);
  });

  test("accepts max = options.length (0–2 of 2)", () => {
    accepts(OptionGroupSchema, { ...SIZE_GROUP, minChoices: 0, maxChoices: 2 });
  });

  test("refuses minChoices > maxChoices (2 > 1)", () => {
    refuses(OptionGroupSchema, { ...SIZE_GROUP, minChoices: 2, maxChoices: 1 });
  });

  test("refuses maxChoices > options.length (3 > 2)", () => {
    refuses(OptionGroupSchema, { ...SIZE_GROUP, maxChoices: 3 });
  });
});

describe("PromoCodeSchema (§7.6): upper case, 2–20 of A–Z 0–9; percent at most 100", () => {
  test("accepts HAHN10 at 10 %, a percent code of 100 and a fixed code of 300 cents", () => {
    accepts(PromoCodeSchema, PERCENT);
    accepts(PromoCodeSchema, { ...PERCENT, value: 100 });
    accepts(PromoCodeSchema, { code: "WELCOME3", kind: "fixed", value: 300, active: true });
  });

  test("refuses a percent value of 101", () => {
    refuses(PromoCodeSchema, { ...PERCENT, value: 101 });
  });

  test("accepts a fixed value of 101 (cents, not percent)", () => {
    accepts(PromoCodeSchema, { ...PERCENT, kind: "fixed", value: 101 });
  });

  test("refuses a lower-case code", () => {
    refuses(PromoCodeSchema, { ...PERCENT, code: "hahn10" });
  });

  test("refuses a code of 1 or 21 characters, or with a hyphen", () => {
    refuses(PromoCodeSchema, { ...PERCENT, code: "H" });
    refuses(PromoCodeSchema, { ...PERCENT, code: "H".repeat(21) });
    refuses(PromoCodeSchema, { ...PERCENT, code: "HAHN-10" });
  });
});

describe("VatRatesSchema", () => {
  test("accepts the seed's { food: 7, drink: 19 }", () => {
    accepts(VatRatesSchema, { food: 7, drink: 19 });
  });

  test("refuses a rate of 101", () => {
    refuses(VatRatesSchema, { food: 7, drink: 101 });
    refuses(VatRatesSchema, { food: 101, drink: 19 });
  });
});

describe("CartSchema and CartLineSchema (§7.1): 1–30 lines, quantity 1–20", () => {
  const CART: Cart = {
    lines: [line("chicken-burger", { options: ["burger-large", "sauce-garlic"], quantity: 2 })],
    promoCode: "HAHN10",
  };

  test("a cart round-trips its example", () => {
    expect(CartSchema.parse(CART)).toEqual(CART);
  });

  test("accepts a cart without a promoCode, 30 lines and quantity 20", () => {
    accepts(CartSchema, {
      lines: Array.from({ length: 30 }, () => line("ayran", { quantity: 20 })),
    });
  });

  test("refuses a cart with 0 lines", () => {
    refuses(CartSchema, { ...CART, lines: [] });
  });

  test("refuses a cart with 31 lines", () => {
    refuses(CartSchema, { lines: Array.from({ length: 31 }, () => line("ayran")) });
  });

  test("refuses quantity 21 and quantity 0", () => {
    refuses(CartLineSchema, line("ayran", { quantity: 21 }));
    refuses(CartLineSchema, line("ayran", { quantity: 0 }));
    refuses(CartSchema, { lines: [line("ayran", { quantity: 21 })] });
  });
});

describe("ReceiptSchema (§7.5)", () => {
  /** Worked example 1 of §7.4: one burger-menu, no promo. */
  const RECEIPT: Receipt = {
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
        parts: [
          { category: "food", rate: 7, grossCents: 1029, netCents: 962, vatCents: 67 },
          { category: "drink", rate: 19, grossCents: 261, netCents: 219, vatCents: 42 },
        ],
      },
    ],
    itemCount: 1,
    subtotalCents: 1290,
    discountCents: 0,
    totalCents: 1290,
    vat: [
      { rate: 7, grossCents: 1029, netCents: 962, vatCents: 67 },
      { rate: 19, grossCents: 261, netCents: 219, vatCents: 42 },
    ],
  };

  test("the worked example's receipt round-trips", () => {
    expect(ReceiptSchema.parse(RECEIPT)).toEqual(RECEIPT);
  });

  test("a receipt with a promoCode round-trips", () => {
    const withPromo = { ...RECEIPT, promoCode: "HAHN10" };
    expect(ReceiptSchema.parse(withPromo)).toEqual(withPromo);
  });

  test("refuses a receipt without lines and a negative total", () => {
    refuses(ReceiptSchema, { ...RECEIPT, lines: [] });
    refuses(ReceiptSchema, { ...RECEIPT, totalCents: -1 });
  });
});
