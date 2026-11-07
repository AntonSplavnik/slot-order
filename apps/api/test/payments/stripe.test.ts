import { type Cart, priceCart } from "@slot-order/core";
import Stripe from "stripe";
import { describe, expect, test } from "vitest";
import { ZodError } from "zod";
import { line, seedMenu } from "../../../../packages/core/test/fixtures/menu";
import { seedConfig } from "../../../../packages/core/test/fixtures/slotConfigs";
import {
  checkoutSessionParams,
  createStripePayments,
  type StripeClient,
} from "../../src/payments/stripe";
import { BadSignatureError, type CheckoutUrls, PaymentsError } from "../../src/payments/types";
import { createMemoryRepository } from "../../src/repo/memory";
import type { Order } from "../../src/repo/types";
import { seconds, stripeEvent } from "../helpers/app";

// docs/design.md §9.1 (the Checkout Session's parameters), §9.3 (refunds with the idempotency key
// `refund:<order id>`), §9.4 (createStripePayments over a StripeClient: every Stripe error a
// PaymentsError with the original as `cause`, an answer without a URL a failure; checkoutSessionParams
// pure), §9.2 steps 1–2 (verifyWebhook: constructEventAsync with the 300 s tolerance measured from `now`,
// a missing or bad signature or a body that is not JSON → BadSignatureError, then stripeEventFromRaw),
// §17 (`stripe` 23.1.0). A recording stub stands in for the Stripe API; the signatures are real, made and
// checked by an offline `Stripe` instance that never sends a request.

/** Mon 2026-11-09 12:00 Berlin. */
const NOW = new Date("2026-11-09T11:00:00Z");
/** now + 31 minutes in epoch seconds (§9.1). */
const EXPIRES_AT = seconds(new Date("2026-11-09T11:31:00Z"));
const SECRET = "whsec_x";
const ORDER_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";

/** Never sends anything: used for its webhook helpers only. */
const offline = new Stripe("sk_test_offline");

/** The order the API would hold for `cart` (priced by core), stored by the memory repository. */
async function orderOf(cart: Cart, customerName = "Ada"): Promise<Order> {
  const repo = createMemoryRepository({ settings: seedConfig, menu: seedMenu });
  const receipt = priceCart(seedMenu, cart);
  return repo.placeHold(
    {
      slotStart: new Date("2026-11-09T11:30:00Z"),
      customerName,
      lines: receipt.lines,
      receipt,
      itemCount: receipt.itemCount,
      totalCents: receipt.totalCents,
      promoCode: receipt.promoCode ?? null,
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

const BURGER: Cart = { lines: [line("burger-menu")] };
/** Chicken Burger ×2, large with garlic sauce, and Cola ×3: 5 items, 27.50. */
const TWO_LINES: Cart = {
  lines: [
    line("chicken-burger", { quantity: 2, options: ["burger-large", "sauce-garlic"] }),
    line("cola", { quantity: 3 }),
  ],
};

// The recording stub.

type Seen = {
  create: Stripe.Checkout.SessionCreateParams[];
  expire: string[];
  refund: [Stripe.RefundCreateParams, Stripe.RequestOptions | undefined][];
};

/** A StripeClient that records every call and answers `cs_1` with `url`, or throws `error`. */
function recordingStripe({
  url = "https://checkout.stripe.com/c/pay/cs_1",
  error,
}: {
  url?: string | null;
  error?: Error;
} = {}): { client: StripeClient; seen: Seen } {
  const seen: Seen = { create: [], expire: [], refund: [] };
  const client: StripeClient = {
    checkout: {
      sessions: {
        create: async (params) => {
          seen.create.push(params);
          if (error !== undefined) throw error;
          return { id: "cs_1", url };
        },
        expire: async (id) => {
          seen.expire.push(id);
          if (error !== undefined) throw error;
          return { id, status: "expired" };
        },
      },
    },
    refunds: {
      create: async (params, options) => {
        seen.refund.push([params, options]);
        if (error !== undefined) throw error;
        return { id: "re_1", status: "succeeded" };
      },
    },
    webhooks: offline.webhooks,
  };
  return { client, seen };
}

describe("createStripePayments over a recording stub (§9.4)", () => {
  test("createCheckout answers { sessionId, url } and sends exactly checkoutSessionParams(order, urls, now)", async () => {
    const order = await orderOf(BURGER);
    const { client, seen } = recordingStripe();
    const payments = createStripePayments(client, SECRET);

    expect(await payments.createCheckout(order, urlsFor(order), NOW)).toEqual({
      sessionId: "cs_1",
      url: "https://checkout.stripe.com/c/pay/cs_1",
    });
    expect(seen.create).toEqual([checkoutSessionParams(order, urlsFor(order), NOW)]);
  });

  test("an answer without a URL is a failure: rejects with a PaymentsError (§9.1)", async () => {
    const order = await orderOf(BURGER);
    const { client } = recordingStripe({ url: null });
    await expect(
      createStripePayments(client, SECRET).createCheckout(order, urlsFor(order), NOW),
    ).rejects.toBeInstanceOf(PaymentsError);
  });

  test("Stripe throwing in createCheckout: a PaymentsError whose cause is Stripe's error", async () => {
    const order = await orderOf(BURGER);
    const boom = new Error("boom");
    const { client } = recordingStripe({ error: boom });
    const failure = createStripePayments(client, SECRET).createCheckout(order, urlsFor(order), NOW);
    await expect(failure).rejects.toBeInstanceOf(PaymentsError);
    await expect(failure).rejects.toMatchObject({ cause: boom });
  });

  test("expireSession('cs_1') expires that session", async () => {
    const { client, seen } = recordingStripe();
    await expect(
      createStripePayments(client, SECRET).expireSession("cs_1"),
    ).resolves.toBeUndefined();
    expect(seen.expire).toEqual(["cs_1"]);
  });

  test("Stripe refusing the expiry (a complete session): a PaymentsError whose cause is Stripe's error", async () => {
    const refused = new Error("This Checkout Session is not in an expirable state");
    const { client } = recordingStripe({ error: refused });
    const failure = createStripePayments(client, SECRET).expireSession("cs_1");
    await expect(failure).rejects.toBeInstanceOf(PaymentsError);
    await expect(failure).rejects.toMatchObject({ cause: refused });
  });

  test("refund('pi_1', orderId) refunds the payment intent with the idempotency key refund:<orderId> (§9.3)", async () => {
    const { client, seen } = recordingStripe();
    await expect(
      createStripePayments(client, SECRET).refund("pi_1", ORDER_ID),
    ).resolves.toBeUndefined();
    expect(seen.refund).toEqual([
      [{ payment_intent: "pi_1" }, { idempotencyKey: `refund:${ORDER_ID}` }],
    ]);
  });

  test("Stripe refusing the refund: a PaymentsError whose cause is Stripe's error", async () => {
    const boom = new Error("boom");
    const { client } = recordingStripe({ error: boom });
    const failure = createStripePayments(client, SECRET).refund("pi_1", ORDER_ID);
    await expect(failure).rejects.toBeInstanceOf(PaymentsError);
    await expect(failure).rejects.toMatchObject({ cause: boom });
  });
});

describe("createStripePayments(…).verifyWebhook with real signatures (§9.2 steps 1–2)", () => {
  const payments = createStripePayments(offline, SECRET);
  const PAYLOAD = JSON.stringify(stripeEvent({ orderId: ORDER_ID }));
  const REDUCED = {
    id: "evt_1",
    type: "checkout.session.completed",
    sessionId: "cs_test_1",
    paymentStatus: "paid",
    paymentIntentId: "pi_1",
    orderId: ORDER_ID,
  };

  /** Stripe's `Stripe-Signature` header for `payload`, signed with `secret` at `at`. */
  function header(payload: string, { secret = SECRET, at = NOW } = {}): string {
    return offline.webhooks.generateTestHeaderString({ payload, secret, timestamp: seconds(at) });
  }

  function secondsBefore(instant: Date, count: number): Date {
    return new Date(instant.getTime() - count * 1000);
  }

  function secondsAfter(instant: Date, count: number): Date {
    return new Date(instant.getTime() + count * 1000);
  }

  test("a payload signed with the secret at now: the StripeEvent reduction", async () => {
    expect(await payments.verifyWebhook(PAYLOAD, header(PAYLOAD), NOW)).toEqual(REDUCED);
  });

  test("signed 299 s before now: accepted (the tolerance is 300 s)", async () => {
    const signature = header(PAYLOAD, { at: secondsBefore(NOW, 299) });
    expect(await payments.verifyWebhook(PAYLOAD, signature, NOW)).toEqual(REDUCED);
  });

  test.each<[string, () => { body: string; signature: string | null }]>([
    [
      "signed with another secret",
      () => ({ body: PAYLOAD, signature: header(PAYLOAD, { secret: "whsec_other" }) }),
    ],
    [
      "a tampered payload",
      () => ({ body: PAYLOAD.replace("pi_1", "pi_9"), signature: header(PAYLOAD) }),
    ],
    [
      "signed 301 s before now",
      () => ({ body: PAYLOAD, signature: header(PAYLOAD, { at: secondsBefore(NOW, 301) }) }),
    ],
    ["no signature (null)", () => ({ body: PAYLOAD, signature: null })],
    ["a header that is not a Stripe signature", () => ({ body: PAYLOAD, signature: "nonsense" })],
    ["an empty body, signed", () => ({ body: "", signature: header("") })],
    [
      "a body that is not JSON, signed",
      () => ({ body: "not json", signature: header("not json") }),
    ],
  ])("%s: rejects with BadSignatureError", async (_case, build) => {
    const { body, signature } = build();
    await expect(payments.verifyWebhook(body, signature, NOW)).rejects.toBeInstanceOf(
      BadSignatureError,
    );
  });

  test("the tolerance is measured from `now`, not the host's clock", async () => {
    // A minute old by `now` in 2020 (years old by any host clock): accepted.
    const past = new Date("2020-01-01T00:00:00Z");
    const oldButFresh = header(PAYLOAD, { at: past });
    expect(await payments.verifyWebhook(PAYLOAD, oldButFresh, secondsAfter(past, 60))).toEqual(
      REDUCED,
    );
    // Six minutes old by `now` in 2030 (in the future by any host clock): refused.
    const future = new Date("2030-01-01T00:00:00Z");
    const staleByNow = header(PAYLOAD, { at: future });
    await expect(
      payments.verifyWebhook(PAYLOAD, staleByNow, secondsAfter(future, 360)),
    ).rejects.toBeInstanceOf(BadSignatureError);
  });

  test("a correctly signed {}: verified, then refused by stripeEventFromRaw with a ZodError", async () => {
    await expect(payments.verifyWebhook("{}", header("{}"), NOW)).rejects.toBeInstanceOf(ZodError);
  });
});

describe("checkoutSessionParams(order, urls, now) (§9.1)", () => {
  function lineItem(name: string, unitAmount: number) {
    return {
      quantity: 1,
      price_data: { currency: "eur", unit_amount: unitAmount, product_data: { name } },
    };
  }

  /** The literal parameters for `order`, with `lineItems`. */
  function expected(order: Order, lineItems: ReturnType<typeof lineItem>[]) {
    return {
      mode: "payment",
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      expires_at: EXPIRES_AT,
      success_url: `https://web.example/orders/${order.id}?paid=1`,
      cancel_url: `https://web.example/orders/${order.id}`,
      line_items: lineItems,
    };
  }

  test.each<{ name: string; cart: Cart; totalCents: number; items: [string, number][] }>([
    { name: "one Burger Menu", cart: BURGER, totalCents: 1290, items: [["Burger Menu", 1290]] },
    {
      name: "one Chicken Burger (large, garlic): options, no quantity prefix",
      cart: {
        lines: [line("chicken-burger", { options: ["burger-large", "sauce-garlic"] })],
      },
      totalCents: 940,
      items: [["Chicken Burger (large, garlic)", 940]],
    },
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
      name: "the same cart with HAHN10: each line's discounted gross",
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
    "$name: exactly these parameters, the line items summing to the total",
    async ({ cart, totalCents, items }) => {
      const order = await orderOf(cart);
      expect(order.receipt.totalCents).toBe(totalCents);
      const params = checkoutSessionParams(order, urlsFor(order), NOW);
      expect(params).toEqual(
        expected(
          order,
          items.map(([name, cents]) => lineItem(name, cents)),
        ),
      );
      const amounts = (params.line_items ?? []).map((item) => item.price_data?.unit_amount ?? 0);
      expect(amounts.reduce((sum, cents) => sum + cents, 0)).toBe(order.receipt.totalCents);
    },
  );

  test("expires_at is now + 31 minutes in epoch seconds: 11:31:00Z for now = 11:00:00Z", async () => {
    const order = await orderOf(BURGER);
    expect(checkoutSessionParams(order, urlsFor(order), NOW).expires_at).toBe(EXPIRES_AT);
    expect(EXPIRES_AT).toBe(Date.UTC(2026, 10, 9, 11, 31) / 1000);
  });

  // SPEC: §9.1 says "now + 31 minutes in epoch seconds" without a rounding rule for a `now` with
  // milliseconds; the seconds are floored (as Stripe's own timestamps), which still leaves more than 30
  // minutes after `now`.
  test("a now with milliseconds is floored to the second: 11:00:00.999Z gives 11:31:00Z", async () => {
    const order = await orderOf(BURGER);
    const params = checkoutSessionParams(
      order,
      urlsFor(order),
      new Date("2026-11-09T11:00:00.999Z"),
    );
    expect(params.expires_at).toBe(EXPIRES_AT);
  });

  test("the URLs are taken from `urls` as given", async () => {
    const order = await orderOf(BURGER);
    const params = checkoutSessionParams(
      order,
      { success: "https://a.example/done?x=1&y=2", cancel: "https://b.example/back#top" },
      NOW,
    );
    expect(params).toMatchObject({
      success_url: "https://a.example/done?x=1&y=2",
      cancel_url: "https://b.example/back#top",
    });
  });

  test("the customer's name is not sent (§9.1)", async () => {
    const order = await orderOf(BURGER, "Ada Lovelace");
    const sent = JSON.stringify(checkoutSessionParams(order, urlsFor(order), NOW));
    expect(sent).not.toContain("Ada");
    expect(sent).not.toContain("Lovelace");
  });

  test("is pure: the same arguments give the same parameters, and the order is not changed", async () => {
    const order = await orderOf(TWO_LINES);
    const before = structuredClone(order);
    expect(checkoutSessionParams(order, urlsFor(order), NOW)).toEqual(
      checkoutSessionParams(order, urlsFor(order), NOW),
    );
    expect(order).toEqual(before);
  });
});
