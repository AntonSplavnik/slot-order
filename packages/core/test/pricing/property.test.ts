import { describe, expect, test } from "vitest";
import {
  allocate,
  type Cart,
  type CartLine,
  itemCount,
  priceCart,
  ReceiptSchema,
} from "../../src/index";
import { seedItem, seedMenu } from "../fixtures/menu";

// docs/design.md §7.3–§7.5, §13 "Pricing": invariants over 200 random valid carts on the seed menu, each with
// a random promo or none. The carts come from a seeded PRNG (mulberry32, fixed seed), so every run checks the
// same carts; a failure names the cart.

/** mulberry32: a small seeded PRNG returning uint32s. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const next = mulberry32(20261106);

/** A random integer in [min, max]. */
function int(min: number, max: number): number {
  return min + Math.floor((next() / 2 ** 32) * (max - min + 1));
}

function pick<T>(values: readonly T[]): T {
  return values[int(0, values.length - 1)] as T;
}

function shuffle<T>(values: readonly T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(0, i);
    const swap = out[i] as T;
    out[i] = out[j] as T;
    out[j] = swap;
  }
  return out;
}

/** Valid promo inputs: none, the empty string, and the seed's active codes, also untidy. */
const PROMOS = [undefined, "", "HAHN10", "WELCOME3", " hahn10 ", "welcome3"] as const;

/** A valid line: any seed item (all active), a valid number of distinct options per group, any order. */
function randomLine(): CartLine {
  const item = pick(seedMenu.items);
  const optionIds = item.optionGroups.flatMap((group) =>
    shuffle(group.options)
      .slice(0, int(group.minChoices, group.maxChoices))
      .map((option) => option.id),
  );
  return { itemId: item.id, quantity: int(1, 20), optionIds: shuffle(optionIds) };
}

/** Mostly 1–6 lines, sometimes up to the maximum of 30. */
function randomCart(): Cart {
  const count = int(1, 10) === 10 ? int(7, 30) : int(1, 6);
  const lines = Array.from({ length: count }, randomLine);
  const promoCode = pick(PROMOS);
  return promoCode === undefined ? { lines } : { lines, promoCode };
}

const CARTS: readonly Cart[] = Array.from({ length: 200 }, randomCart);

/** Each cart with its receipt and a label for failure messages. */
function priced() {
  return CARTS.map((cart, index) => ({
    cart,
    receipt: priceCart(seedMenu, cart),
    label: `cart #${index}: ${JSON.stringify(cart)}`,
  }));
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** §7.3.1 from the menu: price_cents + the chosen options' deltas. */
function expectedUnitGross(cartLine: CartLine): number {
  const item = seedItem(cartLine.itemId);
  const options = item.optionGroups.flatMap((group) => group.options);
  return (
    item.priceCents +
    sum(
      options
        .filter((option) => cartLine.optionIds.includes(option.id))
        .map((o) => o.priceDeltaCents),
    )
  );
}

/** §7.3.3: percent → round(subtotal × value / 100), halves up; fixed → min(value, subtotal); none → 0. */
function expectedDiscount(subtotal: number, promoCode: string | undefined): number {
  const code = (promoCode ?? "").trim().toUpperCase();
  if (code === "") return 0;
  const promo = seedMenu.promoCodes.find((p) => p.code === code);
  if (promo === undefined) throw new Error(`the generator produced an unknown promo ${code}`);
  return promo.kind === "percent"
    ? Math.floor((2 * subtotal * promo.value + 100) / 200)
    : Math.min(promo.value, subtotal);
}

/** §7.4: round(gross × 100 / (100 + rate)), halves up, in integers. */
function expectedNet(gross: number, rate: number): number {
  return Math.floor((200 * gross + 100 + rate) / (2 * (100 + rate)));
}

describe("priceCart over 200 random valid carts (seeded)", () => {
  test("the generator covers what it should: combos, options, promos, long carts", () => {
    const lines = CARTS.flatMap((c) => c.lines);
    expect(lines.some((l) => l.itemId === "burger-menu")).toBe(true);
    expect(lines.some((l) => l.itemId === "wings-menu")).toBe(true);
    expect(lines.some((l) => l.optionIds.length >= 3)).toBe(true);
    expect(CARTS.some((c) => c.promoCode === undefined)).toBe(true);
    expect(CARTS.some((c) => c.promoCode?.trim().toUpperCase() === "HAHN10")).toBe(true);
    expect(CARTS.some((c) => c.promoCode?.trim().toUpperCase() === "WELCOME3")).toBe(true);
    expect(CARTS.some((c) => c.lines.length > 10)).toBe(true);
  });

  test("never throws for a valid cart, and the receipt parses with ReceiptSchema", () => {
    for (const { receipt, label } of priced()) {
      expect(ReceiptSchema.parse(receipt), label).toEqual(receipt);
    }
  });

  test("is deterministic: the same cart twice gives equal receipts, and the cart is not changed", () => {
    for (const { cart, receipt, label } of priced()) {
      const before = JSON.stringify(cart);
      expect(priceCart(seedMenu, cart), label).toEqual(receipt);
      expect(priceCart(seedMenu, JSON.parse(before)), label).toEqual(receipt);
      expect(JSON.stringify(cart), label).toBe(before);
    }
  });

  test("one priced line per cart line, in order, with unit gross = price + deltas and line gross = unit × quantity", () => {
    for (const { cart, receipt, label } of priced()) {
      expect(
        receipt.lines.map((l) => [l.itemId, l.quantity]),
        label,
      ).toEqual(cart.lines.map((l) => [l.itemId, l.quantity]));
      cart.lines.forEach((cartLine, i) => {
        const pricedLine = receipt.lines[i];
        expect(pricedLine?.unitGrossCents, label).toBe(expectedUnitGross(cartLine));
        expect(pricedLine?.lineGrossCents, label).toBe(
          expectedUnitGross(cartLine) * cartLine.quantity,
        );
      });
    }
  });

  test("itemCount = Σ quantity = itemCount(cart)", () => {
    for (const { cart, receipt, label } of priced()) {
      const quantities = sum(cart.lines.map((l) => l.quantity));
      expect(receipt.itemCount, label).toBe(quantities);
      expect(itemCount(cart), label).toBe(quantities);
    }
  });

  test("subtotalCents = Σ line gross; discountCents follows §7.3.3", () => {
    for (const { cart, receipt, label } of priced()) {
      expect(receipt.subtotalCents, label).toBe(sum(receipt.lines.map((l) => l.lineGrossCents)));
      expect(receipt.discountCents, label).toBe(
        expectedDiscount(receipt.subtotalCents, cart.promoCode),
      );
    }
  });

  test("Σ line.discountCents = discountCents, each line's share the floor or the ceiling of its exact share", () => {
    for (const { receipt, label } of priced()) {
      expect(sum(receipt.lines.map((l) => l.discountCents)), label).toBe(receipt.discountCents);
      for (const l of receipt.lines) {
        const floor = Math.floor(
          (receipt.discountCents * l.lineGrossCents) / receipt.subtotalCents,
        );
        expect(l.discountCents - floor, label).toBeGreaterThanOrEqual(0);
        expect(l.discountCents - floor, label).toBeLessThanOrEqual(1);
      }
    }
  });

  test("totalCents = subtotalCents − discountCents = Σ (line gross − line discount)", () => {
    for (const { receipt, label } of priced()) {
      expect(receipt.totalCents, label).toBe(receipt.subtotalCents - receipt.discountCents);
      expect(receipt.totalCents, label).toBe(
        sum(receipt.lines.map((l) => l.lineGrossCents - l.discountCents)),
      );
    }
  });

  test("per line Σ parts.gross = line gross − line discount; one part per category at the menu's rate", () => {
    for (const { receipt, label } of priced()) {
      for (const l of receipt.lines) {
        expect(sum(l.parts.map((p) => p.grossCents)), label).toBe(
          l.lineGrossCents - l.discountCents,
        );
        const categories = l.parts.map((p) => p.category);
        expect(new Set(categories).size, label).toBe(categories.length);
        for (const p of l.parts) expect(p.rate, label).toBe(seedMenu.vatRates[p.category]);
        if (l.kind === "item") {
          expect(categories, label).toEqual([seedItem(l.itemId).vatCategory]);
        }
      }
    }
  });

  test("every part: net = round(gross × 100 / (100 + rate)) halves up, and net + vat = gross", () => {
    for (const { receipt, label } of priced()) {
      for (const p of receipt.lines.flatMap((l) => l.parts)) {
        expect(p.netCents, label).toBe(expectedNet(p.grossCents, p.rate));
        expect(p.netCents + p.vatCents, label).toBe(p.grossCents);
      }
    }
  });

  test("the VAT summary: ascending unique rates, each the sum of the parts at its rate, net + vat = gross, Σ gross = totalCents", () => {
    for (const { receipt, label } of priced()) {
      const parts = receipt.lines.flatMap((l) => l.parts);
      const rates = [...new Set(parts.map((p) => p.rate))].sort((a, b) => a - b);
      expect(
        receipt.vat.map((v) => v.rate),
        label,
      ).toEqual(rates);
      for (const v of receipt.vat) {
        const atRate = parts.filter((p) => p.rate === v.rate);
        expect(v, label).toEqual({
          rate: v.rate,
          grossCents: sum(atRate.map((p) => p.grossCents)),
          netCents: sum(atRate.map((p) => p.netCents)),
          vatCents: sum(atRate.map((p) => p.vatCents)),
        });
        expect(v.netCents + v.vatCents, label).toBe(v.grossCents);
      }
      expect(sum(receipt.vat.map((v) => v.grossCents)), label).toBe(receipt.totalCents);
    }
  });
});

describe("allocate over 500 random cases (seeded)", () => {
  const cases = Array.from({ length: 500 }, () => {
    const weights = Array.from({ length: int(1, 8) }, () => (int(1, 5) === 1 ? 0 : int(0, 2000)));
    return { total: int(0, 5000), weights };
  });

  test("the shares sum to the total, one per weight, none negative", () => {
    for (const { total, weights } of cases) {
      const label = `allocate(${total}, ${JSON.stringify(weights)})`;
      const shares = allocate(total, weights);
      expect(shares, label).toHaveLength(weights.length);
      expect(sum(shares), label).toBe(total);
      for (const share of shares) expect(share, label).toBeGreaterThanOrEqual(0);
    }
  });

  test("with a positive weight sum, each share is the floor or the ceiling of total × weight / Σ weights", () => {
    for (const { total, weights } of cases) {
      const label = `allocate(${total}, ${JSON.stringify(weights)})`;
      const weightSum = sum(weights);
      if (weightSum === 0) continue;
      allocate(total, weights).forEach((share, i) => {
        const floor = Math.floor((total * (weights[i] ?? 0)) / weightSum);
        expect(share - floor, label).toBeGreaterThanOrEqual(0);
        expect(share - floor, label).toBeLessThanOrEqual(1);
      });
    }
  });
});
