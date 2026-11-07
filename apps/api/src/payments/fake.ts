import Stripe from "stripe";
import { checkoutSessionParams, verifyStripeWebhook } from "./stripe";
import { type Payments, PaymentsError } from "./types";

// The fake payments (docs/design.md §9.4): records every call, can be told to fail, mints signed test
// events, and verifies signatures for real (the same function as the Stripe adapter, on an offline
// `Stripe` instance with the fake's secret). Nothing reads the clock; nothing touches the network.

export type FakePaymentsOptions = { webhookSecret?: string };

export type FakeMethod = "createCheckout" | "expireSession" | "refund";

export type FakeCalls = {
  createCheckout: { orderId: string; params: Stripe.Checkout.SessionCreateParams }[];
  expireSession: string[];
  refund: { paymentIntentId: string; orderId: string }[];
};

/** A webhook request's body and `Stripe-Signature` header. */
export type SignedEvent = { body: string; signature: string };

export type FakePayments = Payments & {
  /** The secret `signedEvent` signs with and `verifyWebhook` checks against (default `whsec_test`). */
  readonly webhookSecret: string;
  /** Every call, in order. Sessions are `cs_test_1`, `cs_test_2`, … with `https://checkout.stripe.com/c/pay/<id>`. */
  readonly calls: FakeCalls;
  /** While on, the method throws a PaymentsError (the call is still recorded). */
  fail(method: FakeMethod, on?: boolean): void;
  /** `raw` as Stripe would send it (`{ id, type, data: { object } }`), signed at `now`. */
  signedEvent(raw: unknown, now: Date): Promise<SignedEvent>;
};

export function createFakePayments(options: FakePaymentsOptions = {}): FakePayments {
  const webhookSecret = options.webhookSecret ?? "whsec_test";
  const calls: FakeCalls = { createCheckout: [], expireSession: [], refund: [] };
  const failing = new Set<FakeMethod>();
  // Names the sessions: only a successful creation takes a number.
  let sessions = 0;
  // Used for its webhook helpers only: it never sends a request, so its key is a placeholder.
  const offline = new Stripe("sk_test_offline");

  /** After the call is recorded: a PaymentsError while `method` is told to fail. */
  function failIfTold(method: FakeMethod): void {
    if (failing.has(method)) throw new PaymentsError(`fake ${method} failed`);
  }

  return {
    webhookSecret,
    calls,

    fail(method, on = true) {
      if (on) failing.add(method);
      else failing.delete(method);
    },

    // Signs exactly `JSON.stringify(raw)` with Stripe's own test header at `now` in epoch seconds.
    async signedEvent(raw, now) {
      const payload = JSON.stringify(raw);
      const signature = await offline.webhooks.generateTestHeaderStringAsync({
        payload,
        secret: webhookSecret,
        timestamp: Math.floor(now.getTime() / 1000),
      });
      return { body: payload, signature };
    },

    async createCheckout(order, urls, now) {
      calls.createCheckout.push({
        orderId: order.id,
        params: checkoutSessionParams(order, urls, now),
      });
      failIfTold("createCheckout");
      sessions += 1;
      const sessionId = `cs_test_${sessions}`;
      return { sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}` };
    },

    async expireSession(sessionId) {
      calls.expireSession.push(sessionId);
      failIfTold("expireSession");
    },

    async refund(paymentIntentId, orderId) {
      calls.refund.push({ paymentIntentId, orderId });
      failIfTold("refund");
    },

    // §9.2 steps 1–2: the adapter's own verification, with the fake's secret.
    async verifyWebhook(rawBody, signature, now) {
      return verifyStripeWebhook(offline.webhooks, webhookSecret, rawBody, signature, now);
    },
  };
}
