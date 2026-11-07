import {
  type Cart,
  type CartErrorCode,
  CreateOrderResponseSchema,
  type OrderSummary,
  OrderSummarySchema,
  priceCart,
  type SlotErrorCode,
  SlotsResponseSchema,
} from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { runCron } from "../../src/app";
import { createMemoryRepository } from "../../src/repo/memory";
import {
  BURGER,
  byLabel,
  checkoutUrlOf,
  colas,
  DAY,
  expectError,
  expectJson,
  line,
  makeApp,
  NOW,
  orderBody,
  payOrder,
  pickupCodeOf,
  placeOrder,
  request,
  S,
  STAFF_TOKEN,
  seconds,
  seedConfig,
  seedMenu,
  type TestApp,
  type TestDeps,
  UNKNOWN_ID,
  UUID,
  usageAt,
  WEB_ORIGIN,
} from "../helpers/app";

// docs/design.md §10 (POST /orders, in order: validate, price, settings, usage, checkSlot, pickup code,
// placeHold, then the Checkout Session and setCheckout; GET /orders/:id), §10.1 (CreateOrderRequest,
// CreateOrderResponse, OrderSummary: fields only in the states that have them), §8.2–§8.3, §9.1 (the
// Checkout Session), §6.2 checkSlot, §12. The seed; now = Mon 2026-11-09 12:00 Berlin (11:00Z) unless a
// test moves the clock; S = 12:30 Berlin; the fake payments answer the sessions cs_test_1, cs_test_2, …

/** An ISO instant in UTC (§10.1: responses always end in Z). */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const HOLD_EXPIRES_AT = "2026-11-09T11:10:00.000Z";
/** The first order's Checkout Session URL (the fake's cs_test_1, §9.4). */
const CHECKOUT_URL_1 = checkoutUrlOf("cs_test_1");

async function postOrder(app: TestApp, body: unknown) {
  return request(app, "POST", "/orders", { body });
}

async function getOrder(app: TestApp, id: string) {
  return request(app, "GET", `/orders/${id}`);
}

/** Every order the repository holds for the week of the tests. */
async function allOrders(deps: TestDeps) {
  return deps.repo.listOrders(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-20T00:00:00Z"));
}

/** The fields every summary has, whatever its status (§10.1), picked from the 201 summary. */
function always(summary: OrderSummary) {
  const { id, status, slotStart, slotLabel, customerName, itemCount, receipt, createdAt } = summary;
  return { id, status, slotStart, slotLabel, customerName, itemCount, receipt, createdAt };
}

describe("POST /orders holds a slot", () => {
  test("201: a held order for Ada at 12:30, priced by the server, held for 10 minutes", async () => {
    const { app } = makeApp();
    const res = await postOrder(app, orderBody());
    const body = expectJson(res, 201, CreateOrderResponseSchema);
    // SPEC: the brief pins `createdAt` = the clock's now. §10.2's placeHold takes no instant and §5's
    // place_hold stamps created_at with the database's now(), and createMemoryRepository gets no clock, so
    // createdAt is the repository's time, not deps.now(). Pinned as a UTC instant that GET repeats.
    expect(body).toEqual({
      checkoutUrl: CHECKOUT_URL_1,
      order: {
        id: expect.stringMatching(UUID),
        status: "held",
        slotStart: S,
        slotLabel: "12:30",
        customerName: "Ada",
        itemCount: 1,
        receipt: priceCart(seedMenu, BURGER),
        createdAt: expect.stringMatching(ISO_UTC),
        checkoutUrl: CHECKOUT_URL_1,
        holdExpiresAt: HOLD_EXPIRES_AT,
      },
    });
    expect(body.order).not.toHaveProperty("pickupCode");
    expect(body.order).not.toHaveProperty("paidAt");
  });

  test("GET /orders/:id then answers the same summary", async () => {
    const { app } = makeApp();
    const order = await placeOrder(app);
    expect(expectJson(await getOrder(app, order.id), 200, OrderSummarySchema)).toEqual(order);
  });

  test("the order's items are booked: GET /slots shows 12:30 with 19 available", async () => {
    const { app, deps } = makeApp();
    await placeOrder(app);
    const slots = expectJson(
      await request(app, "GET", `/slots?date=${DAY}`),
      200,
      SlotsResponseSchema,
    );
    expect(byLabel(slots.slots, "12:30")).toMatchObject({ available: 19, bookable: true });
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });

  test("stores the priced order: lines, receipt, item count, total, promo code, pickup code, expiry", async () => {
    const { app, deps } = makeApp();
    const cart: Cart = { ...BURGER, promoCode: "HAHN10" };
    const order = await placeOrder(app, cart);
    const receipt = priceCart(seedMenu, cart);
    expect(order.receipt).toEqual(receipt);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      id: order.id,
      status: "held",
      slotStart: new Date(S),
      customerName: "Ada",
      lines: receipt.lines,
      receipt,
      itemCount: 1,
      totalCents: 1161,
      promoCode: "HAHN10",
      pickupCode: pickupCodeOf(1),
      holdExpiresAt: new Date(HOLD_EXPIRES_AT),
      paidAt: null,
    });
  });

  test("the name is stored trimmed: ' Ada ' becomes 'Ada'", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app, { customerName: " Ada " });
    expect(order.customerName).toBe("Ada");
    expect((await deps.repo.getOrder(order.id))?.customerName).toBe("Ada");
  });

  test("a name of 60 characters is accepted (§10.1: 1–60)", async () => {
    const { app } = makeApp();
    const order = await placeOrder(app, { customerName: "A".repeat(60) });
    expect(order.customerName).toBe("A".repeat(60));
  });

  test("the server prices: a body carrying its own receipt and total is accepted, and they are ignored", async () => {
    const { app, deps } = makeApp();
    const res = await postOrder(app, orderBody({ receipt: { totalCents: 1 }, totalCents: 1 }));
    const { order } = expectJson(res, 201, CreateOrderResponseSchema);
    expect(order.receipt).toEqual(priceCart(seedMenu, BURGER));
    const stored = await deps.repo.getOrder(order.id);
    expect(stored?.receipt.totalCents).toBe(1290);
    expect(stored?.totalCents).toBe(1290);
  });

  test("each order gets the next pickup code from randomBytes, shown neither in the 201 nor while held", async () => {
    const { app, deps } = makeApp();
    const first = await postOrder(app, orderBody());
    const second = await postOrder(app, orderBody({ customerName: "Grace" }));
    const firstId = expectJson(first, 201, CreateOrderResponseSchema).order.id;
    const secondId = expectJson(second, 201, CreateOrderResponseSchema).order.id;

    expect((await deps.repo.getOrder(firstId))?.pickupCode).toBe(pickupCodeOf(1));
    expect((await deps.repo.getOrder(secondId))?.pickupCode).toBe(pickupCodeOf(2));
    expect(first.text).not.toContain(pickupCodeOf(1));
    expect(second.text).not.toContain(pickupCodeOf(2));
    const summary = await getOrder(app, firstId);
    expect(summary.status).toBe(200);
    expect(summary.json).not.toHaveProperty("pickupCode");
    expect(summary.text).not.toContain(pickupCodeOf(1));
  });
});

describe("POST /orders creates the Checkout Session after the hold (§9.1, §8.2, §10)", () => {
  /** §9.1: expires_at = now + 31 minutes in epoch seconds; now = 11:00:00Z. */
  const EXPIRES_AT = seconds(new Date("2026-11-09T11:31:00Z"));

  /** A line item of §9.1: quantity 1, the line's discounted gross, the name with options and quantity. */
  function lineItem(name: string, unitAmount: number) {
    return {
      quantity: 1,
      price_data: { currency: "eur", unit_amount: unitAmount, product_data: { name } },
    };
  }

  /** The literal Checkout Session parameters of §9.1 for order `id`, with `lineItems`. */
  function sessionParams(id: string, lineItems: ReturnType<typeof lineItem>[]) {
    return {
      mode: "payment",
      client_reference_id: id,
      metadata: { order_id: id },
      expires_at: EXPIRES_AT,
      success_url: `${WEB_ORIGIN}/orders/${id}?paid=1`,
      cancel_url: `${WEB_ORIGIN}/orders/${id}`,
      line_items: lineItems,
    };
  }

  /** Chicken Burger ×2, large with garlic sauce, and Cola ×3: 5 items, 2 lines, 27.50. */
  const TWO_LINES: Cart = {
    lines: [
      line("chicken-burger", { quantity: 2, options: ["burger-large", "sauce-garlic"] }),
      line("cola", { quantity: 3 }),
    ],
  };

  test("201: the session's URL at the top and in the held summary; the order stores its session id and URL", async () => {
    const { app, deps } = makeApp();
    const body = expectJson(await postOrder(app, orderBody()), 201, CreateOrderResponseSchema);
    expect(body.checkoutUrl).toBe(CHECKOUT_URL_1);
    expect(body.order.checkoutUrl).toBe(CHECKOUT_URL_1);
    expect(await deps.repo.getOrder(body.order.id)).toMatchObject({
      status: "held",
      stripeSessionId: "cs_test_1",
      checkoutUrl: CHECKOUT_URL_1,
    });
  });

  test("GET /orders/:id repeats the URL while held; once paid there is no checkoutUrl and no holdExpiresAt", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    const held = expectJson(await getOrder(app, order.id), 200, OrderSummarySchema);
    expect(held).toMatchObject({ status: "held", checkoutUrl: CHECKOUT_URL_1 });

    deps.clock.set("2026-11-09T11:03:00Z");
    await payOrder(deps, order.id);
    const paid = expectJson(await getOrder(app, order.id), 200, OrderSummarySchema);
    expect(paid.status).toBe("paid");
    expect(paid).not.toHaveProperty("checkoutUrl");
    expect(paid).not.toHaveProperty("holdExpiresAt");
    // The stored order keeps its session (§10.2 Order); only the summary hides the URL.
    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      stripeSessionId: "cs_test_1",
      checkoutUrl: CHECKOUT_URL_1,
    });
  });

  test("the second order of a test gets the second session, cs_test_2", async () => {
    const { app, deps } = makeApp();
    await placeOrder(app);
    const body = expectJson(
      await postOrder(app, orderBody({ customerName: "Grace" })),
      201,
      CreateOrderResponseSchema,
    );
    expect(body.checkoutUrl).toBe(checkoutUrlOf("cs_test_2"));
    expect(body.order.checkoutUrl).toBe(checkoutUrlOf("cs_test_2"));
    expect(await deps.repo.getOrder(body.order.id)).toMatchObject({
      stripeSessionId: "cs_test_2",
      checkoutUrl: checkoutUrlOf("cs_test_2"),
    });
  });

  test("createCheckout is called once, with exactly the §9.1 parameters for one Burger Menu", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app, { customerName: "Ada Lovelace" });
    expect(deps.payments.calls.createCheckout).toEqual([
      { orderId: order.id, params: sessionParams(order.id, [lineItem("Burger Menu", 1290)]) },
    ]);
  });

  test("the customer's name is not sent to Stripe (§9.1)", async () => {
    const { app, deps } = makeApp();
    await placeOrder(app, { customerName: "Ada Lovelace" });
    expect(deps.payments.calls.createCheckout).toHaveLength(1);
    const sent = JSON.stringify(deps.payments.calls.createCheckout);
    expect(sent).not.toContain("Ada");
    expect(sent).not.toContain("Lovelace");
  });

  test.each<{ name: string; cart: Cart; totalCents: number; items: [string, number][] }>([
    {
      name: "Chicken Burger ×2 (large, garlic) and Cola ×3",
      cart: TWO_LINES,
      totalCents: 2750,
      items: [
        ["2 × Chicken Burger (large, garlic)", 1880],
        ["3 × Cola 0.33 l", 870],
      ],
    },
    {
      name: "the same cart with HAHN10",
      cart: { ...TWO_LINES, promoCode: "HAHN10" },
      totalCents: 2475,
      items: [
        ["2 × Chicken Burger (large, garlic)", 1692],
        ["3 × Cola 0.33 l", 783],
      ],
    },
    {
      name: "one Burger Menu with HAHN10",
      cart: { ...BURGER, promoCode: "HAHN10" },
      totalCents: 1161,
      items: [["Burger Menu", 1161]],
    },
  ])(
    "line items for $name: one per priced line, quantity 1, summing to the total",
    async ({ cart, totalCents, items }) => {
      const { app, deps } = makeApp();
      const order = await placeOrder(app, cart);
      expect(order.receipt.totalCents).toBe(totalCents);
      const [call] = deps.payments.calls.createCheckout;
      expect(call?.params).toEqual(
        sessionParams(
          order.id,
          items.map(([name, cents]) => lineItem(name, cents)),
        ),
      );
      const amounts = (call?.params.line_items ?? []).map(
        (item) => item.price_data?.unit_amount ?? 0,
      );
      expect(amounts.reduce((sum, cents) => sum + cents, 0)).toBe(order.receipt.totalCents);
    },
  );

  test("Stripe fails: 502 payment_unavailable; the hold is released as cancelled with stripe_failed", async () => {
    const { app, deps } = makeApp();
    deps.payments.fail("createCheckout");
    expectError(await postOrder(app, orderBody()), 502, "payment_unavailable");

    const orders = await allOrders(deps);
    expect(orders).toHaveLength(1);
    const [order] = orders;
    expect(order).toMatchObject({
      status: "cancelled",
      cancelReason: "stripe_failed",
      cancelledAt: new Date(NOW),
      holdExpiresAt: null,
      stripeSessionId: null,
      checkoutUrl: null,
    });
    expect(deps.payments.calls.createCheckout).toHaveLength(1);
    expect(deps.payments.calls.createCheckout[0]?.orderId).toBe(order?.id);
    expect(await usageAt(deps, S)).toEqual({ booked: 0, capacity: 20 });

    const summary = expectJson(await getOrder(app, order?.id ?? ""), 200, OrderSummarySchema);
    expect(summary).toEqual({
      id: order?.id,
      status: "cancelled",
      slotStart: S,
      slotLabel: "12:30",
      customerName: "Ada",
      itemCount: 1,
      receipt: priceCart(seedMenu, BURGER),
      createdAt: expect.stringMatching(ISO_UTC),
      cancelReason: "stripe_failed",
      cancelledAt: NOW,
    });
  });

  test("Stripe is called only once the slot is held: refused orders (409, 400) add no createCheckout call", async () => {
    const { app, deps } = makeApp();
    const full = await placeOrder(app, colas(20));
    expectError(await postOrder(app, orderBody()), 409, "slot_full");
    expectError(
      await postOrder(app, orderBody({ slotStart: "2026-11-08T12:00:00Z" })),
      409,
      "closed_day",
    );
    expectError(await postOrder(app, orderBody({ lines: [line("nope")] })), 400, "unknown_item");
    expectError(await postOrder(app, orderBody({ customerName: "" })), 400, "validation");
    expect(deps.payments.calls.createCheckout.map((call) => call.orderId)).toEqual([full.id]);
  });

  test("setCheckout fails after the session was created: 500 internal; the order stays held without a session", async () => {
    // §10: such a hold stays held without a URL; the cron releases it (§8.4).
    const memory = createMemoryRepository({ settings: seedConfig, menu: seedMenu });
    const { app, deps } = makeApp({
      repo: {
        ...memory,
        setCheckout: async () => {
          throw new Error("db down");
        },
      },
    });
    const res = await postOrder(app, orderBody());
    expectError(res, 500, "internal");
    expect(res.text).not.toContain("db down");

    expect(deps.payments.calls.createCheckout).toHaveLength(1);
    const orders = await allOrders(deps);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      status: "held",
      stripeSessionId: null,
      checkoutUrl: null,
      holdExpiresAt: new Date(HOLD_EXPIRES_AT),
    });
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });
});

describe("POST /orders refuses a body that fails CreateOrderRequestSchema: 400 validation", () => {
  test.each([
    ["a blank name", orderBody({ customerName: " " })],
    ["a name of 61 characters", orderBody({ customerName: "A".repeat(61) })],
    ["no name", orderBody({ customerName: undefined })],
    ["no slotStart", orderBody({ slotStart: undefined })],
    ["a slotStart that is not an instant", orderBody({ slotStart: "12:30" })],
    ["a slotStart without an offset", orderBody({ slotStart: "2026-11-09T12:30:00" })],
    ["no lines", { slotStart: S, customerName: "Ada" }],
  ])("%s", async (_case, body) => {
    const { app, deps } = makeApp();
    const error = expectError(await postOrder(app, body), 400, "validation");
    expect(error.issues?.length).toBeGreaterThan(0);
    expect(await allOrders(deps)).toEqual([]);
  });
});

describe("POST /orders answers a SlotError as 409 with its code (§6.2 checkSlot, §12)", () => {
  test.each<[SlotErrorCode, string, string]>([
    ["closed_day", "2026-11-08T12:00:00Z", "Sunday 13:00"],
    ["too_far", "2026-11-16T11:00:00Z", "Monday 12:00 a week ahead, day 8 of 7"],
    ["slot_not_on_grid", "2026-11-09T11:37:00Z", "12:37"],
    ["slot_past_cutoff", "2026-11-09T10:00:00Z", "11:00, already past"],
    ["slot_too_soon", "2026-11-09T11:15:00Z", "12:15, before the earliest start 12:30"],
  ])("%s for %s (%s), and nothing is booked", async (code, slotStart) => {
    const { app, deps } = makeApp();
    expectError(await postOrder(app, orderBody({ slotStart })), 409, code);
    expect(await usageAt(deps, slotStart)).toBeUndefined();
    expect(await allOrders(deps)).toEqual([]);
  });

  test("too_many_items for 21 items (cola ×20 and ayran ×1) against a capacity of 20", async () => {
    const { app, deps } = makeApp();
    const lines = [line("cola", { quantity: 20 }), line("ayran")];
    expectError(await postOrder(app, orderBody({ lines })), 409, "too_many_items");
    expect(await usageAt(deps, S)).toBeUndefined();
  });

  test("slot_full for 1 item after a hold of cola ×20 at 12:30", async () => {
    const { app, deps } = makeApp();
    await placeOrder(app, colas(20));
    expectError(await postOrder(app, orderBody()), 409, "slot_full");
    expect(await usageAt(deps, S)).toEqual({ booked: 20, capacity: 20 });
    expect(await allOrders(deps)).toHaveLength(1);
  });
});

describe("POST /orders answers a CartError as 400 with its code and lineIndex (§12)", () => {
  test.each<{ code: CartErrorCode; lines: Cart["lines"]; lineIndex: number }>([
    { code: "unknown_item", lines: [line("burger-menu"), line("nope")], lineIndex: 1 },
    { code: "option_count", lines: [line("fries"), line("cola")], lineIndex: 0 },
    {
      code: "options_on_combo",
      lines: [line("cola"), line("wings-menu", { options: ["wings-hot"] })],
      lineIndex: 1,
    },
  ])("$code with lineIndex $lineIndex", async ({ code, lines, lineIndex }) => {
    const { app, deps } = makeApp();
    const error = expectError(await postOrder(app, orderBody({ lines })), 400, code);
    expect(error.lineIndex).toBe(lineIndex);
    expect(await allOrders(deps)).toEqual([]);
  });

  test("an unknown promo code: 400 promo_invalid", async () => {
    const { app, deps } = makeApp();
    expectError(await postOrder(app, orderBody({ promoCode: "NOPE" })), 400, "promo_invalid");
    expect(await usageAt(deps, S)).toBeUndefined();
  });

  test("the cart is priced before the slot is checked: an unknown item on a Sunday is unknown_item", async () => {
    const { app } = makeApp();
    const body = orderBody({ lines: [line("nope")], slotStart: "2026-11-08T12:00:00Z" });
    expect(expectError(await postOrder(app, body), 400, "unknown_item").lineIndex).toBe(0);
  });
});

describe("GET /orders/:id", () => {
  test("an id that is not a UUID: 400 validation", async () => {
    const { app } = makeApp();
    expectError(await getOrder(app, "not-a-uuid"), 400, "validation");
  });

  test("an unknown UUID: 404 order_not_found", async () => {
    const { app } = makeApp();
    expectError(await getOrder(app, UNKNOWN_ID), 404, "order_not_found");
  });

  test("paid: the pickup code and paidAt appear; checkoutUrl and holdExpiresAt are gone", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    deps.clock.set("2026-11-09T11:03:00Z");
    await payOrder(deps, order.id);

    const summary = expectJson(await getOrder(app, order.id), 200, OrderSummarySchema);
    expect(summary).toEqual({
      ...always(order),
      status: "paid",
      pickupCode: pickupCodeOf(1),
      paidAt: "2026-11-09T11:03:00.000Z",
    });
  });

  test("cancelled (the hold released with stripe_failed): cancelReason and cancelledAt, no code", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    deps.clock.set("2026-11-09T11:04:00Z");
    await deps.repo.releaseHold(order.id, "cancelled", "stripe_failed", deps.now());

    const summary = expectJson(await getOrder(app, order.id), 200, OrderSummarySchema);
    expect(summary).toEqual({
      ...always(order),
      status: "cancelled",
      cancelReason: "stripe_failed",
      cancelledAt: "2026-11-09T11:04:00.000Z",
    });
  });

  test("expired by the cron: expiredAt, no holdExpiresAt, no code", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    deps.clock.set("2026-11-09T11:11:00Z");
    expect(await runCron(deps)).toEqual({ released: 1, sessionsExpired: 1 });

    const summary = expectJson(await getOrder(app, order.id), 200, OrderSummarySchema);
    expect(summary).toEqual({
      ...always(order),
      status: "expired",
      expiredAt: "2026-11-09T11:11:00.000Z",
    });
  });

  test("ready, then picked up at the counter: every timestamp once it exists, and the code", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    deps.clock.set("2026-11-09T11:03:00Z");
    await payOrder(deps, order.id);
    deps.clock.set("2026-11-09T11:20:00Z");
    const ready = await request(app, "POST", `/staff/orders/${order.id}/ready`, {
      token: STAFF_TOKEN,
    });
    expect(ready.status).toBe(200);
    deps.clock.set("2026-11-09T11:35:00Z");
    const pickup = await request(app, "POST", "/staff/pickup", {
      token: STAFF_TOKEN,
      body: { code: pickupCodeOf(1) },
    });
    expect(pickup.status).toBe(200);

    const summary = expectJson(await getOrder(app, order.id), 200, OrderSummarySchema);
    expect(summary).toEqual({
      ...always(order),
      status: "picked_up",
      pickupCode: pickupCodeOf(1),
      paidAt: "2026-11-09T11:03:00.000Z",
      readyAt: "2026-11-09T11:20:00.000Z",
      pickedUpAt: "2026-11-09T11:35:00.000Z",
    });
  });
});
