import { type Cart, CartError, CartSchema, priceCart } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import {
  addLine,
  CART_KEY,
  clearCart,
  emptyCart,
  itemCount,
  itemQuantity,
  loadCart,
  priceLocally,
  removeLine,
  saveCart,
  setPromoCode,
  setQuantity,
} from "../src/lib/cart";
import {
  BURGER,
  cart,
  line,
  memoryStorage,
  publicMenu,
  seedMenu,
  TWO_LINES,
  throwingStorage,
} from "./helpers";

// docs/design.md §11.2 `cart.ts`: core's `Cart` shape, pure functions that return a new cart and never
// mutate their input (every input here is deep-frozen), local pricing with core's `priceCart` (§7), and the
// persistence through an injected storage. §11.1: lines with the same item and options merge.

const LARGE_GARLIC = ["burger-large", "sauce-garlic"];

/** `n` adds of the same line, from the empty cart. */
function addTimes(n: number, itemId: string, optionIds: readonly string[]): Cart {
  let current = emptyCart();
  for (let i = 0; i < n; i += 1) current = addLine(current, itemId, optionIds);
  return current;
}

describe("emptyCart and itemCount (§11.2)", () => {
  test("the empty cart has no lines and no promoCode key", () => {
    const empty = emptyCart();
    expect(empty).toEqual({ lines: [] });
    expect(empty).not.toHaveProperty("promoCode");
  });

  test("the empty cart counts 0 items", () => {
    expect(itemCount(emptyCart())).toBe(0);
  });

  test("itemCount is the sum of the quantities: burger ×2 and cola ×3 → 5", () => {
    expect(
      itemCount(cart([line("chicken-burger", { quantity: 2 }), line("cola", { quantity: 3 })])),
    ).toBe(5);
  });
});

describe("addLine merges the same item and option set, else appends (§11.1, §11.2)", () => {
  test("the first add appends a line with quantity 1 and the options as given", () => {
    expect(addLine(emptyCart(), "chicken-burger", LARGE_GARLIC)).toEqual({
      lines: [
        { itemId: "chicken-burger", quantity: 1, optionIds: ["burger-large", "sauce-garlic"] },
      ],
    });
  });

  test("the same item with the same options again: one line, quantity 2", () => {
    const once = cart([line("chicken-burger", { options: LARGE_GARLIC })]);
    expect(addLine(once, "chicken-burger", LARGE_GARLIC)).toEqual({
      lines: [{ itemId: "chicken-burger", quantity: 2, optionIds: LARGE_GARLIC }],
    });
  });

  test("the same option set in another order merges too (order ignored), keeping the line's own order", () => {
    const twice = cart([line("chicken-burger", { options: LARGE_GARLIC, quantity: 2 })]);
    expect(addLine(twice, "chicken-burger", ["sauce-garlic", "burger-large"])).toEqual({
      lines: [{ itemId: "chicken-burger", quantity: 3, optionIds: LARGE_GARLIC }],
    });
  });

  test("other options are another line, appended", () => {
    const once = cart([line("chicken-burger", { options: LARGE_GARLIC, quantity: 3 })]);
    expect(addLine(once, "chicken-burger", ["burger-regular", "sauce-garlic"])).toEqual({
      lines: [
        { itemId: "chicken-burger", quantity: 3, optionIds: LARGE_GARLIC },
        { itemId: "chicken-burger", quantity: 1, optionIds: ["burger-regular", "sauce-garlic"] },
      ],
    });
  });

  test("a subset of a line's options is not the same set: a new line", () => {
    const once = cart([line("chicken-burger", { options: LARGE_GARLIC })]);
    const next = addLine(once, "chicken-burger", ["burger-large"]);
    expect(next.lines).toHaveLength(2);
    expect(next.lines[1]).toEqual({
      itemId: "chicken-burger",
      quantity: 1,
      optionIds: ["burger-large"],
    });
  });

  test("an item without options is appended with optionIds []", () => {
    const two = cart([
      line("chicken-burger", { options: LARGE_GARLIC, quantity: 3 }),
      line("chicken-burger", { options: ["burger-regular", "sauce-garlic"] }),
    ]);
    const next = addLine(two, "cola", []);
    expect(next.lines).toHaveLength(3);
    expect(next.lines[2]).toEqual({ itemId: "cola", quantity: 1, optionIds: [] });
  });

  test("twenty adds stop at quantity 20 (CartLine's maximum); the 21st changes nothing", () => {
    const twenty = addTimes(20, "cola", []);
    expect(twenty).toEqual({ lines: [{ itemId: "cola", quantity: 20, optionIds: [] }] });
    expect(addLine(cart(twenty.lines), "cola", [])).toEqual(twenty);
  });

  test("the promo code is kept", () => {
    expect(addLine(cart([line("cola")], "HAHN10"), "cola", [])).toEqual({
      lines: [{ itemId: "cola", quantity: 2, optionIds: [] }],
      promoCode: "HAHN10",
    });
  });

  test("the input cart is not mutated", () => {
    const before = cart([line("cola")]);
    addLine(before, "cola", []);
    addLine(before, "ayran", []);
    expect(before).toEqual({ lines: [{ itemId: "cola", quantity: 1, optionIds: [] }] });
  });
});

describe("setQuantity: below 1 removes, above 20 clamps, a bad index changes nothing (§11.2)", () => {
  const two = cart([line("cola", { quantity: 2 }), line("ayran")]);

  test("sets the quantity: line 0 → 5", () => {
    expect(setQuantity(two, 0, 5)).toEqual({
      lines: [line("cola", { quantity: 5 }), line("ayran")],
    });
  });

  test("25 clamps to 20", () => {
    expect(setQuantity(two, 0, 25).lines[0]?.quantity).toBe(20);
  });

  test.each([0, -1])("%i removes the line", (quantity) => {
    expect(setQuantity(two, 0, quantity)).toEqual({ lines: [line("ayran")] });
  });

  // SPEC: §11.2 says both "a bad index leaves the cart as it is" and "every function returns a new
  // object". Decision: compared with toEqual, so either a copy or the same object passes.
  test.each([7, 2, -1])("index %i on a two-line cart leaves the cart as it is", (index) => {
    expect(setQuantity(two, index, 3)).toEqual(two);
  });

  // SPEC: §11.2 says nothing about a non-integer quantity; CartLine needs an integer, so the brief pins
  // Math.floor (2.7 → 2, and 0.5 → 0, which removes the line).
  test("a non-integer is floored: 2.7 → 2; 0.5 removes the line", () => {
    expect(setQuantity(two, 0, 2.7).lines[0]).toEqual(line("cola", { quantity: 2 }));
    expect(setQuantity(two, 0, 0.5)).toEqual({ lines: [line("ayran")] });
  });

  test("the promo code is kept and the input is not mutated", () => {
    const withCode = cart([line("cola")], "HAHN10");
    expect(setQuantity(withCode, 0, 4)).toEqual({
      lines: [line("cola", { quantity: 4 })],
      promoCode: "HAHN10",
    });
    expect(withCode).toEqual({ lines: [line("cola")], promoCode: "HAHN10" });
  });
});

describe("removeLine (§11.2)", () => {
  const three = cart([line("cola"), line("ayran"), line("water")]);

  test("index 1 removes the second line", () => {
    expect(removeLine(three, 1)).toEqual({ lines: [line("cola"), line("water")] });
  });

  test.each([3, -1])("index %i leaves the cart as it is", (index) => {
    expect(removeLine(three, index)).toEqual(three);
  });

  test("the input is not mutated", () => {
    removeLine(three, 0);
    expect(three.lines).toHaveLength(3);
  });
});

describe("setPromoCode: trimmed and upper-cased, empty removes it (§11.2)", () => {
  test('" hahn10 " → "HAHN10"', () => {
    expect(setPromoCode(cart([line("cola")]), " hahn10 ")).toEqual({
      lines: [line("cola")],
      promoCode: "HAHN10",
    });
  });

  test("blank → no promoCode key, also on a cart that had one", () => {
    expect(setPromoCode(cart([line("cola")]), "   ")).not.toHaveProperty("promoCode");
    const cleared = setPromoCode(cart([line("cola")], "HAHN10"), "");
    expect(cleared).toEqual({ lines: [line("cola")] });
    expect(cleared).not.toHaveProperty("promoCode");
  });
});

describe("priceLocally = core's priceCart on the public menu, without the code (§11.2, §7)", () => {
  test("one Burger Menu: priceCart's receipt, 12.90", () => {
    const receipt = priceLocally(publicMenu, BURGER);
    expect(receipt).toEqual(priceCart(seedMenu, { lines: BURGER.lines }));
    expect(receipt.totalCents).toBe(1290);
  });

  test("a large garlic burger ×2 and three colas: priceCart's receipt, 27.50", () => {
    const receipt = priceLocally(publicMenu, TWO_LINES);
    expect(receipt).toEqual(priceCart(seedMenu, { lines: TWO_LINES.lines }));
    expect(receipt.totalCents).toBe(2750);
  });

  // The browser never sees the code list (§10 GET /menu); a code is priced by POST /quotes.
  test.each(["HAHN10", "NOPE"])(
    "a promo code (%s) on the cart is ignored: no discount, no error",
    (code) => {
      const receipt = priceLocally(publicMenu, cart(BURGER.lines, code));
      expect(receipt).toEqual(priceCart(seedMenu, { lines: BURGER.lines }));
      expect(receipt.discountCents).toBe(0);
      expect(receipt).not.toHaveProperty("promoCode");
    },
  );

  test("an unknown item throws core's CartError unknown_item with its line", () => {
    const bad = cart([line("cola"), line("nope")]);
    let thrown: unknown;
    try {
      priceLocally(publicMenu, bad);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CartError);
    expect(thrown).toMatchObject({ code: "unknown_item", lineIndex: 1 });
  });
});

describe("persistence through an injected storage (§11.2)", () => {
  const stored = cart(
    [line("chicken-burger", { options: LARGE_GARLIC, quantity: 2 }), line("cola")],
    "HAHN10",
  );

  test("an empty storage loads the empty cart", () => {
    expect(loadCart(memoryStorage())).toEqual(emptyCart());
  });

  test("saveCart then loadCart gives the same cart back", () => {
    const storage = memoryStorage();
    saveCart(storage, stored);
    expect(loadCart(storage)).toEqual(stored);
  });

  test('the cart is stored under "slot-order.cart" as JSON that CartSchema parses', () => {
    const storage = memoryStorage();
    saveCart(storage, stored);
    expect(CART_KEY).toBe("slot-order.cart");
    const raw = storage.getItem("slot-order.cart");
    expect(raw).not.toBeNull();
    expect(CartSchema.parse(JSON.parse(raw ?? ""))).toEqual(stored);
  });

  test("saving the empty cart and loading it again gives the empty cart", () => {
    const storage = memoryStorage();
    saveCart(storage, stored);
    saveCart(storage, emptyCart());
    expect(loadCart(storage)).toEqual(emptyCart());
  });

  // CartSchema needs at least one line, so a stored `{ lines: [] }` fails it too and reads as empty.
  test.each([
    ["text that is not JSON", "{not json"],
    ["a line without quantity and options", JSON.stringify({ lines: [{ itemId: "x" }] })],
    ["a promoCode that is not a string", JSON.stringify({ lines: [line("cola")], promoCode: 7 })],
    ["a quantity above 20", JSON.stringify({ lines: [line("cola", { quantity: 21 })] })],
    ["null", "null"],
    ["an array", "[]"],
  ])("a stored value that fails CartSchema (%s) loads the empty cart", (_name, raw) => {
    const storage = memoryStorage();
    storage.setItem(CART_KEY, raw);
    expect(loadCart(storage)).toEqual(emptyCart());
  });

  test("a throwing storage loads the empty cart", () => {
    expect(loadCart(throwingStorage())).toEqual(emptyCart());
  });

  // SPEC: §11.2 says a throwing storage loads as empty but not what saving into one does. Decision:
  // saveCart and clearCart swallow the error (the cart lives on in memory), so a browser with storage
  // blocked can still order.
  test("saveCart and clearCart on a throwing storage do not throw", () => {
    expect(() => saveCart(throwingStorage(), stored)).not.toThrow();
    expect(() => clearCart(throwingStorage())).not.toThrow();
  });

  test("clearCart removes the key", () => {
    const storage = memoryStorage();
    saveCart(storage, stored);
    clearCart(storage);
    expect(storage.getItem(CART_KEY)).toBeNull();
    expect(loadCart(storage)).toEqual(emptyCart());
  });
});

describe("itemQuantity: the sum over every option set of one item (§11.2, §11.7)", () => {
  test("0 for the empty cart and for an item that is not in the cart", () => {
    expect(itemQuantity(emptyCart(), "cola")).toBe(0);
    expect(itemQuantity(BURGER, "cola")).toBe(0);
  });

  test("one line: its quantity (cola ×3 → 3)", () => {
    expect(itemQuantity(cart([line("cola", { quantity: 3 })]), "cola")).toBe(3);
  });

  test("the same item with different option sets adds up: large garlic ×2 + regular ×3 → 5", () => {
    const burgers = cart([
      line("chicken-burger", { options: LARGE_GARLIC, quantity: 2 }),
      line("chicken-burger", { options: ["burger-regular"], quantity: 3 }),
    ]);
    expect(itemQuantity(burgers, "chicken-burger")).toBe(5);
  });

  test("other items are not counted: the two-line cart has 2 burgers, 3 colas and no fries", () => {
    expect(itemQuantity(TWO_LINES, "chicken-burger")).toBe(2);
    expect(itemQuantity(TWO_LINES, "cola")).toBe(3);
    expect(itemQuantity(TWO_LINES, "fries")).toBe(0);
  });
});
