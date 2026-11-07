import { priceCart } from "@slot-order/core";
import { beforeEach, describe, expect, test } from "vitest";
import { ZodError } from "zod";
import { line, seedMenu } from "../../../../packages/core/test/fixtures/menu";
import { seedConfig } from "../../../../packages/core/test/fixtures/slotConfigs";
import { createFakePayments } from "../../src/payments/fake";
import { checkoutSessionParams } from "../../src/payments/stripe";
import { BadSignatureError, type CheckoutUrls, PaymentsError } from "../../src/payments/types";
import { createMemoryRepository } from "../../src/repo/memory";
import type { Order } from "../../src/repo/types";
import { seconds, stripeEvent } from "../helpers/app";

// docs/design.md §9.4 (the fake: records every call in order, sessions cs_test_1, cs_test_2, … numbered
// by successful creations with the URL https://checkout.stripe.com/c/pay/<id>, `fail(method, on)`,
// `signedEvent(raw, now)` signed with Stripe's own test header, and the real verification of §9.2 steps
// 1–2 with the fake's secret). Nothing reads the real clock; nothing touches the network.

/** Mon 2026-11-09 12:00 Berlin. */
const NOW = new Date("2026-11-09T11:00:00Z");
const ORDER_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";

/** A held order of one Burger Menu at 12:30 Berlin, as the memory repository stores it. */
async function heldOrder(): Promise<Order> {
  const repo = createMemoryRepository({ settings: seedConfig, menu: seedMenu });
  const receipt = priceCart(seedMenu, { lines: [line("burger-menu")] });
  return repo.placeHold(
    {
      slotStart: new Date("2026-11-09T11:30:00Z"),
      customerName: "Ada",
      lines: receipt.lines,
      receipt,
      itemCount: receipt.itemCount,
      totalCents: receipt.totalCents,
      promoCode: null,
      pickupCode: "TEST0001",
    },
    20,
    new Date("2026-11-09T11:10:00Z"),
  );
}

function urlsFor(order: Order): CheckoutUrls {
  return {
    success: `https://web.example/orders/${order.id}?paid=1`,
    cancel: `https://web.example/orders/${order.id}`,
  };
}

describe("createFakePayments: Checkout Sessions, expiry, refunds (§9.4)", () => {
  let order: Order;

  beforeEach(async () => {
    order = await heldOrder();
  });

  test("webhookSecret is whsec_test by default, or the one given", () => {
    expect(createFakePayments().webhookSecret).toBe("whsec_test");
    expect(createFakePayments({ webhookSecret: "whsec_other" }).webhookSecret).toBe("whsec_other");
  });

  test("calls start empty", () => {
    expect(createFakePayments().calls).toEqual({
      createCheckout: [],
      expireSession: [],
      refund: [],
    });
  });

  test("createCheckout answers cs_test_1 with its URL, then cs_test_2", async () => {
    const payments = createFakePayments();
    expect(await payments.createCheckout(order, urlsFor(order), NOW)).toEqual({
      sessionId: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    expect(await payments.createCheckout(order, urlsFor(order), NOW)).toEqual({
      sessionId: "cs_test_2",
      url: "https://checkout.stripe.com/c/pay/cs_test_2",
    });
  });

  test("records each call as { orderId, params: checkoutSessionParams(order, urls, now) }", async () => {
    const payments = createFakePayments();
    await payments.createCheckout(order, urlsFor(order), NOW);
    expect(payments.calls.createCheckout).toEqual([
      { orderId: order.id, params: checkoutSessionParams(order, urlsFor(order), NOW) },
    ]);
  });

  test("fail('createCheckout'): rejects with a PaymentsError, and the call is still recorded", async () => {
    const payments = createFakePayments();
    payments.fail("createCheckout");
    await expect(payments.createCheckout(order, urlsFor(order), NOW)).rejects.toBeInstanceOf(
      PaymentsError,
    );
    expect(payments.calls.createCheckout).toEqual([
      { orderId: order.id, params: checkoutSessionParams(order, urlsFor(order), NOW) },
    ]);
  });

  test("sessions are numbered by successful creations: two, a failure, then the next is cs_test_3", async () => {
    const payments = createFakePayments();
    await payments.createCheckout(order, urlsFor(order), NOW);
    await payments.createCheckout(order, urlsFor(order), NOW);
    payments.fail("createCheckout");
    await expect(payments.createCheckout(order, urlsFor(order), NOW)).rejects.toBeInstanceOf(
      PaymentsError,
    );
    payments.fail("createCheckout", false);
    expect(await payments.createCheckout(order, urlsFor(order), NOW)).toEqual({
      sessionId: "cs_test_3",
      url: "https://checkout.stripe.com/c/pay/cs_test_3",
    });
    expect(payments.calls.createCheckout).toHaveLength(4);
  });

  test("expireSession records the session id; while failed it rejects with a PaymentsError, still recorded", async () => {
    const payments = createFakePayments();
    await expect(payments.expireSession("cs_test_1")).resolves.toBeUndefined();
    payments.fail("expireSession");
    await expect(payments.expireSession("cs_test_2")).rejects.toBeInstanceOf(PaymentsError);
    expect(payments.calls.expireSession).toEqual(["cs_test_1", "cs_test_2"]);
  });

  test("refund records { paymentIntentId, orderId }; while failed it rejects with a PaymentsError, still recorded", async () => {
    const payments = createFakePayments();
    await expect(payments.refund("pi_1", order.id)).resolves.toBeUndefined();
    payments.fail("refund");
    await expect(payments.refund("pi_2", ORDER_ID)).rejects.toBeInstanceOf(PaymentsError);
    expect(payments.calls.refund).toEqual([
      { paymentIntentId: "pi_1", orderId: order.id },
      { paymentIntentId: "pi_2", orderId: ORDER_ID },
    ]);
  });

  test("fail affects only the method named, and fail(method, false) turns it off", async () => {
    const payments = createFakePayments();
    payments.fail("refund");
    await expect(payments.createCheckout(order, urlsFor(order), NOW)).resolves.toMatchObject({
      sessionId: "cs_test_1",
    });
    await expect(payments.expireSession("cs_test_1")).resolves.toBeUndefined();
    await expect(payments.refund("pi_1", order.id)).rejects.toBeInstanceOf(PaymentsError);
    payments.fail("refund", false);
    await expect(payments.refund("pi_1", order.id)).resolves.toBeUndefined();
    expect(payments.calls.refund).toHaveLength(2);
  });
});

describe("createFakePayments: signedEvent and verifyWebhook (§9.4, §9.2 steps 1–2)", () => {
  const RAW = stripeEvent({ orderId: ORDER_ID });
  const REDUCED = {
    id: "evt_1",
    type: "checkout.session.completed",
    sessionId: "cs_test_1",
    paymentStatus: "paid",
    paymentIntentId: "pi_1",
    orderId: ORDER_ID,
  };

  test("signedEvent(raw, now): the body is JSON.stringify(raw); the header is t=<now in seconds>,v1=<64 hex>", async () => {
    const signed = await createFakePayments().signedEvent(RAW, NOW);
    expect(signed.body).toBe(JSON.stringify(RAW));
    const match = /^t=(\d+),v1=[0-9a-f]{64}$/.exec(signed.signature);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(seconds(NOW));
  });

  test("verifyWebhook of a signed event answers the StripeEvent reduction", async () => {
    const payments = createFakePayments();
    const { body, signature } = await payments.signedEvent(RAW, NOW);
    expect(await payments.verifyWebhook(body, signature, NOW)).toEqual(REDUCED);
  });

  test("a signature made 299 s before now is accepted (the tolerance is 300 s)", async () => {
    const payments = createFakePayments();
    const { body, signature } = await payments.signedEvent(RAW, new Date(NOW.getTime() - 299_000));
    expect(await payments.verifyWebhook(body, signature, NOW)).toEqual(REDUCED);
  });

  test.each<[string, (now: Date) => Promise<{ body: string; signature: string | null }>]>([
    [
      "another fake's signature (another secret)",
      (now) => createFakePayments({ webhookSecret: "whsec_other" }).signedEvent(RAW, now),
    ],
    [
      "a changed body",
      async (now) => {
        const signed = await createFakePayments().signedEvent(RAW, now);
        return { ...signed, body: signed.body.replace("pi_1", "pi_9") };
      },
    ],
    [
      "a signature made 6 minutes before now",
      (now) => createFakePayments().signedEvent(RAW, new Date(now.getTime() - 360_000)),
    ],
    [
      "no signature (null)",
      async (now) => ({ ...(await createFakePayments().signedEvent(RAW, now)), signature: null }),
    ],
  ])("%s: rejects with BadSignatureError", async (_case, build) => {
    const payments = createFakePayments();
    const { body, signature } = await build(NOW);
    await expect(payments.verifyWebhook(body, signature, NOW)).rejects.toBeInstanceOf(
      BadSignatureError,
    );
  });

  test("a verified event without id and type: rejects with a ZodError (the route answers 400 validation)", async () => {
    const payments = createFakePayments();
    const { body, signature } = await payments.signedEvent({ object: "event" }, NOW);
    await expect(payments.verifyWebhook(body, signature, NOW)).rejects.toBeInstanceOf(ZodError);
  });
});
