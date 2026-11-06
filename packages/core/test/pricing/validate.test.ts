import { describe, expect, test } from "vitest";
import { type Cart, CartError, type CartErrorCode, type Menu, priceCart } from "../../src/index";
import { line, seedMenu, withBurgerSmall, withInactiveItem } from "../fixtures/menu";

// docs/design.md §7.2: priceCart throws CartError { code, lineIndex? }; the first error in this order wins:
// empty_cart, too_many_lines; then per line, in line order: unknown_item, item_inactive, options_on_combo,
// unknown_option, duplicate_option, option_count, quantity_out_of_range, invalid_price; then promo_invalid.
// Seed menu (test/fixtures/menu.ts) unless noted.

/** The CartError `priceCart` throws, as plain data; any other error (or none) fails the test as it is. */
function refusal(cart: Cart, menu: Menu = seedMenu) {
  try {
    priceCart(menu, cart);
  } catch (error) {
    if (error instanceof CartError) return { code: error.code, lineIndex: error.lineIndex };
    throw error;
  }
  throw new Error("expected priceCart to throw a CartError, it returned a receipt");
}

const refused = (code: CartErrorCode, lineIndex?: number) => ({ code, lineIndex });

/** A valid burger: regular size, no sauce. */
const BURGER = line("chicken-burger", { options: ["burger-regular"] });
const AYRAN = line("ayran");

describe("priceCart: cart-level errors", () => {
  test("refuses { lines: [] } with empty_cart and no lineIndex", () => {
    expect(refusal({ lines: [] })).toEqual(refused("empty_cart"));
  });

  test("refuses 31 lines with too_many_lines and no lineIndex", () => {
    expect(refusal({ lines: Array.from({ length: 31 }, () => AYRAN) })).toEqual(
      refused("too_many_lines"),
    );
  });

  test("accepts 30 lines, the maximum", () => {
    const receipt = priceCart(seedMenu, { lines: Array.from({ length: 30 }, () => AYRAN) });
    expect(receipt.lines).toHaveLength(30);
  });

  test("empty_cart comes before promo_invalid", () => {
    expect(refusal({ lines: [], promoCode: "NOPE" })).toEqual(refused("empty_cart"));
  });

  test("too_many_lines comes before any line error: 31 lines of an unknown item", () => {
    const lines = Array.from({ length: 31 }, () => line("doener"));
    expect(refusal({ lines })).toEqual(refused("too_many_lines"));
  });
});

describe("priceCart: line errors, each on its own", () => {
  test("unknown_item: an item id not on the menu", () => {
    expect(refusal({ lines: [line("doener")] })).toEqual(refused("unknown_item", 0));
  });

  test("item_inactive: coleslaw set inactive", () => {
    const menu = withInactiveItem(seedMenu, "coleslaw");
    expect(refusal({ lines: [line("coleslaw")] }, menu)).toEqual(refused("item_inactive", 0));
  });

  test("item_inactive: an inactive combo (burger-menu)", () => {
    const menu = withInactiveItem(seedMenu, "burger-menu");
    expect(refusal({ lines: [line("burger-menu")] }, menu)).toEqual(refused("item_inactive", 0));
  });

  test("options_on_combo: burger-menu with an option of its component (burger-large)", () => {
    const cart = { lines: [line("burger-menu", { options: ["burger-large"] })] };
    expect(refusal(cart)).toEqual(refused("options_on_combo", 0));
  });

  test("options_on_combo: burger-menu with an option id that exists nowhere", () => {
    const cart = { lines: [line("burger-menu", { options: ["nope"] })] };
    expect(refusal(cart)).toEqual(refused("options_on_combo", 0));
  });

  test("unknown_option: chicken-burger with wings-mild (an option of another item's group)", () => {
    const cart = { lines: [line("chicken-burger", { options: ["burger-regular", "wings-mild"] })] };
    expect(refusal(cart)).toEqual(refused("unknown_option", 0));
  });

  test("unknown_option: chicken-burger with an option id that exists nowhere", () => {
    const cart = { lines: [line("chicken-burger", { options: ["burger-regular", "nope"] })] };
    expect(refusal(cart)).toEqual(refused("unknown_option", 0));
  });

  test("unknown_option: ayran (no groups) with any option", () => {
    const cart = { lines: [line("ayran", { options: ["sauce-garlic"] })] };
    expect(refusal(cart)).toEqual(refused("unknown_option", 0));
  });

  test("duplicate_option: chicken-burger with burger-large twice", () => {
    const cart = { lines: [line("chicken-burger", { options: ["burger-large", "burger-large"] })] };
    expect(refusal(cart)).toEqual(refused("duplicate_option", 0));
  });

  test("duplicate_option: sauce-garlic twice, although two sauces are within the group's max", () => {
    const options = ["burger-regular", "sauce-garlic", "sauce-garlic"];
    expect(refusal({ lines: [line("chicken-burger", { options })] })).toEqual(
      refused("duplicate_option", 0),
    );
  });

  test("option_count: chicken-burger with no size (no options at all)", () => {
    expect(refusal({ lines: [line("chicken-burger")] })).toEqual(refused("option_count", 0));
  });

  test("option_count: chicken-burger with a sauce but no size", () => {
    const cart = { lines: [line("chicken-burger", { options: ["sauce-garlic"] })] };
    expect(refusal(cart)).toEqual(refused("option_count", 0));
  });

  test("option_count: chicken-burger with two sizes", () => {
    const cart = {
      lines: [line("chicken-burger", { options: ["burger-regular", "burger-large"] })],
    };
    expect(refusal(cart)).toEqual(refused("option_count", 0));
  });

  test("option_count: chicken-burger with three sauces (max 2)", () => {
    const options = ["burger-regular", "sauce-garlic", "sauce-chili", "sauce-honey-mustard"];
    expect(refusal({ lines: [line("chicken-burger", { options })] })).toEqual(
      refused("option_count", 0),
    );
  });

  test("option_count: chicken-wings without a heat", () => {
    expect(refusal({ lines: [line("chicken-wings")] })).toEqual(refused("option_count", 0));
  });

  test("quantity_out_of_range: quantity 0", () => {
    expect(refusal({ lines: [{ ...BURGER, quantity: 0 }] })).toEqual(
      refused("quantity_out_of_range", 0),
    );
  });

  test("quantity_out_of_range: quantity 21", () => {
    expect(refusal({ lines: [{ ...BURGER, quantity: 21 }] })).toEqual(
      refused("quantity_out_of_range", 0),
    );
  });

  test("invalid_price: a size with delta −800 on chicken-burger (790) gives a unit gross of −10", () => {
    const cart = { lines: [line("chicken-burger", { options: ["burger-small"] })] };
    expect(refusal(cart, withBurgerSmall(-800))).toEqual(refused("invalid_price", 0));
  });
});

describe("priceCart: what the line checks accept", () => {
  test("chicken-burger with a size and no sauce (sauce min 0)", () => {
    expect(priceCart(seedMenu, { lines: [BURGER] }).lines).toHaveLength(1);
  });

  test("chicken-burger with a size and two sauces (sauce max 2), in any order", () => {
    const options = ["sauce-honey-mustard", "burger-large", "sauce-garlic"];
    expect(
      priceCart(seedMenu, { lines: [line("chicken-burger", { options })] }).lines,
    ).toHaveLength(1);
  });

  test("quantities 1 and 20, the bounds", () => {
    const receipt = priceCart(seedMenu, {
      lines: [
        { ...AYRAN, quantity: 1 },
        { ...AYRAN, quantity: 20 },
      ],
    });
    expect(receipt.lines.map((l) => l.quantity)).toEqual([1, 20]);
  });

  test("a delta of −100 on chicken-burger (790): unit gross 690", () => {
    const cart = { lines: [line("chicken-burger", { options: ["burger-small"] })] };
    expect(priceCart(withBurgerSmall(-100), cart).lines[0]?.unitGrossCents).toBe(690);
  });

  test("a delta of −790 on chicken-burger (790): unit gross 0 is not below 0", () => {
    const cart = { lines: [line("chicken-burger", { options: ["burger-small"] })] };
    expect(priceCart(withBurgerSmall(-790), cart).lines[0]?.unitGrossCents).toBe(0);
  });
});

describe("priceCart: within a line, the first error in the order of §7.2 wins", () => {
  const inactiveCombo = withInactiveItem(seedMenu, "burger-menu");
  const small800 = withBurgerSmall(-800);
  const cases: { name: string; menu: Menu; cart: Cart; code: CartErrorCode }[] = [
    {
      name: "item_inactive before options_on_combo (an inactive burger-menu with an option)",
      menu: inactiveCombo,
      cart: { lines: [line("burger-menu", { options: ["burger-large"] })] },
      code: "item_inactive",
    },
    {
      name: "options_on_combo before quantity_out_of_range",
      menu: seedMenu,
      cart: { lines: [line("burger-menu", { options: ["burger-large"], quantity: 0 })] },
      code: "options_on_combo",
    },
    {
      name: "unknown_option before duplicate_option (wings-mild twice on chicken-burger)",
      menu: seedMenu,
      cart: { lines: [line("chicken-burger", { options: ["wings-mild", "wings-mild"] })] },
      code: "unknown_option",
    },
    {
      name: "unknown_option before option_count (wings-mild and no size on chicken-burger)",
      menu: seedMenu,
      cart: { lines: [line("chicken-burger", { options: ["wings-mild"] })] },
      code: "unknown_option",
    },
    {
      name: "duplicate_option before option_count (burger-large twice is also two sizes)",
      menu: seedMenu,
      cart: { lines: [line("chicken-burger", { options: ["burger-large", "burger-large"] })] },
      code: "duplicate_option",
    },
    {
      name: "option_count before quantity_out_of_range (no size, quantity 0)",
      menu: seedMenu,
      cart: { lines: [line("chicken-burger", { quantity: 0 })] },
      code: "option_count",
    },
    {
      name: "quantity_out_of_range before invalid_price (delta −800, quantity 21)",
      menu: small800,
      cart: { lines: [line("chicken-burger", { options: ["burger-small"], quantity: 21 })] },
      code: "quantity_out_of_range",
    },
  ];

  test.each(cases)("$name", ({ menu, cart, code }) => {
    expect(refusal(cart, menu)).toEqual(refused(code, 0));
  });
});

describe("priceCart: line order", () => {
  test("an error on line 2 reports lineIndex 1", () => {
    expect(refusal({ lines: [AYRAN, line("doener")] })).toEqual(refused("unknown_item", 1));
  });

  test("with the same error on lines 1 and 2, line 1's is thrown", () => {
    expect(refusal({ lines: [line("doener"), line("kebab")] })).toEqual(refused("unknown_item", 0));
  });

  // SPEC: §7.2 "then per line, in line order: unknown_item, …" is read line by line: every check on line 1
  // before any check on line 2, so line 1's later-listed error beats line 2's earlier-listed one.
  test("line 1's quantity_out_of_range beats line 2's unknown_item", () => {
    const cart = { lines: [{ ...BURGER, quantity: 21 }, line("doener")] };
    expect(refusal(cart)).toEqual(refused("quantity_out_of_range", 0));
  });

  test("valid lines before and after do not hide an error on line 3 (lineIndex 2)", () => {
    const cart = { lines: [AYRAN, BURGER, line("chicken-wings"), AYRAN] };
    expect(refusal(cart)).toEqual(refused("option_count", 2));
  });
});

describe("priceCart: promo codes", () => {
  test("refuses an unknown code (NOPE) with promo_invalid and no lineIndex", () => {
    expect(refusal({ lines: [AYRAN], promoCode: "NOPE" })).toEqual(refused("promo_invalid"));
  });

  test("refuses an inactive code (OLD) with promo_invalid", () => {
    expect(refusal({ lines: [AYRAN], promoCode: "OLD" })).toEqual(refused("promo_invalid"));
  });

  test("refuses an inactive code however it is written (' old ')", () => {
    expect(refusal({ lines: [AYRAN], promoCode: " old " })).toEqual(refused("promo_invalid"));
  });

  test("promo_invalid comes after line errors: a bad line and a bad promo give the line error", () => {
    expect(refusal({ lines: [AYRAN, line("doener")], promoCode: "NOPE" })).toEqual(
      refused("unknown_item", 1),
    );
  });

  test("matching is trimmed and case-insensitive: ' hahn10 ' prices like HAHN10", () => {
    const lines = [line("burger-menu")];
    const loose = priceCart(seedMenu, { lines, promoCode: " hahn10 " });
    expect(loose).toEqual(priceCart(seedMenu, { lines, promoCode: "HAHN10" }));
    expect(loose.discountCents).toBe(129);
  });

  test("matching is case-insensitive: 'Welcome3' prices like WELCOME3", () => {
    const lines = [line("burger-menu")];
    expect(priceCart(seedMenu, { lines, promoCode: "Welcome3" })).toEqual(
      priceCart(seedMenu, { lines, promoCode: "WELCOME3" }),
    );
  });

  test("an empty string means no promo: no promoCode on the receipt, discount 0", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu")], promoCode: "" });
    expect(receipt.promoCode).toBeUndefined();
    expect(receipt.discountCents).toBe(0);
    expect(receipt.totalCents).toBe(1290);
  });

  test("no promoCode at all: no promoCode on the receipt, discount 0", () => {
    const receipt = priceCart(seedMenu, { lines: [line("burger-menu")] });
    expect(receipt.promoCode).toBeUndefined();
    expect(receipt.discountCents).toBe(0);
    expect(receipt.totalCents).toBe(1290);
  });

  test("an empty string prices exactly like no promo", () => {
    const lines = [line("burger-menu"), AYRAN];
    expect(priceCart(seedMenu, { lines, promoCode: "" })).toEqual(priceCart(seedMenu, { lines }));
  });
});
