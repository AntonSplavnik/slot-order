import { type Cart, type CartErrorCode, priceCart, ReceiptSchema } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { withInactiveItem } from "../../../../packages/core/test/fixtures/menu";
import { createMemoryRepository } from "../../src/repo/memory";
import {
  BURGER,
  expectError,
  expectJson,
  line,
  makeApp,
  request,
  seedConfig,
  seedMenu,
} from "../helpers/app";

// docs/design.md §10 (POST /quotes: Cart → Receipt, pure, nothing stored), §7 (core's priceCart decides
// every amount), §12 (CartError → 400 with its code and lineIndex; a body failing CartSchema → validation).

describe("POST /quotes prices a cart with core", () => {
  test("one Burger Menu answers 200 with priceCart's receipt: 12.90", async () => {
    const { app } = makeApp();
    const res = await request(app, "POST", "/quotes", { body: BURGER });
    const receipt = expectJson(res, 200, ReceiptSchema);
    expect(receipt).toEqual(priceCart(seedMenu, BURGER));
    expect(receipt.totalCents).toBe(1290);
  });

  test("with HAHN10 the receipt carries the 10 % discount: 129 off", async () => {
    const { app } = makeApp();
    const cart: Cart = { ...BURGER, promoCode: "HAHN10" };
    const receipt = expectJson(
      await request(app, "POST", "/quotes", { body: cart }),
      200,
      ReceiptSchema,
    );
    expect(receipt).toEqual(priceCart(seedMenu, cart));
    expect(receipt.discountCents).toBe(129);
    expect(receipt.totalCents).toBe(1161);
  });

  test("stores nothing: no order, no slot row", async () => {
    const { app, deps } = makeApp();
    expect((await request(app, "POST", "/quotes", { body: BURGER })).status).toBe(200);
    const from = new Date("2026-11-09T00:00:00Z");
    const to = new Date("2026-11-17T00:00:00Z");
    expect(await deps.repo.listOrders(from, to)).toEqual([]);
    expect(await deps.repo.getSlotUsage(from, to)).toEqual(new Map());
  });
});

describe("POST /quotes answers a CartError as 400 with its code (§12)", () => {
  test("an unknown promo code: 400 promo_invalid, no lineIndex", async () => {
    const { app } = makeApp();
    const res = await request(app, "POST", "/quotes", { body: { ...BURGER, promoCode: "NOPE" } });
    const error = expectError(res, 400, "promo_invalid");
    expect(error).not.toHaveProperty("lineIndex");
  });

  test("an unknown item on line 2: 400 unknown_item with lineIndex 1", async () => {
    const { app } = makeApp();
    const cart = { lines: [line("burger-menu"), line("nope")] };
    const error = expectError(
      await request(app, "POST", "/quotes", { body: cart }),
      400,
      "unknown_item",
    );
    expect(error.lineIndex).toBe(1);
  });

  // Line 1 is a valid cola, so lineIndex 1 points at the faulty second line.
  test.each<[CartErrorCode, Cart["lines"][number]]>([
    ["options_on_combo", line("burger-menu", { options: ["fries-large"] })],
    ["unknown_option", line("fries", { options: ["burger-large"] })],
    ["duplicate_option", line("chicken-burger", { options: ["burger-regular", "burger-regular"] })],
    ["option_count", line("fries")],
  ])("%s on line 2: 400 with lineIndex 1", async (code, faulty) => {
    const { app } = makeApp();
    const cart = { lines: [line("cola"), faulty] };
    const error = expectError(await request(app, "POST", "/quotes", { body: cart }), 400, code);
    expect(error.lineIndex).toBe(1);
  });

  test("an inactive item (a menu with Coleslaw switched off): 400 item_inactive with lineIndex 1", async () => {
    const menu = withInactiveItem(seedMenu, "coleslaw");
    const { app } = makeApp({ repo: createMemoryRepository({ settings: seedConfig, menu }) });
    const cart = { lines: [line("cola"), line("coleslaw")] };
    const error = expectError(
      await request(app, "POST", "/quotes", { body: cart }),
      400,
      "item_inactive",
    );
    expect(error.lineIndex).toBe(1);
  });
});

describe("POST /quotes refuses a body that fails CartSchema with 400 validation", () => {
  test("{} (no lines): validation with Zod's issues", async () => {
    const { app } = makeApp();
    const error = expectError(
      await request(app, "POST", "/quotes", { body: {} }),
      400,
      "validation",
    );
    expect(error.issues?.length).toBeGreaterThan(0);
  });

  test("a body that is not JSON: validation", async () => {
    const { app } = makeApp();
    const res = await request(app, "POST", "/quotes", { body: '{"lines": [' });
    expectError(res, 400, "validation");
  });

  // SPEC: §12 lists empty_cart, too_many_lines and quantity_out_of_range as codes of POST /quotes and
  // POST /orders, but CartSchema (lines 1–30, quantity 1–20) refuses those carts before priceCart runs,
  // so through the API they are `validation` (§12: "any body … that fails its Zod schema"). Pinned so.
  test.each([
    ["no lines (empty_cart in core)", { lines: [] }],
    [
      "31 lines (too_many_lines in core)",
      { lines: Array.from({ length: 31 }, () => line("cola")) },
    ],
    ["quantity 21 (quantity_out_of_range in core)", { lines: [line("cola", { quantity: 21 })] }],
  ])("%s: validation", async (_case, cart) => {
    const { app } = makeApp();
    expectError(await request(app, "POST", "/quotes", { body: cart }), 400, "validation");
  });
});
