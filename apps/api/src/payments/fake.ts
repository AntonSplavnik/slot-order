import type Stripe from "stripe";
import type { Payments } from "./types";

// The fake payments (docs/design.md §9.4): records every call, can be told to fail, mints signed test
// events, and verifies signatures for real (the same function as the Stripe adapter, on an offline
// `Stripe` instance with the fake's secret). Not implemented yet (the M5 contract).

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
  return {
    webhookSecret: options.webhookSecret ?? "whsec_test",
    calls: { createCheckout: [], expireSession: [], refund: [] },
    fail() {
      throw new Error("not implemented");
    },
    async signedEvent() {
      throw new Error("not implemented");
    },
    async createCheckout() {
      throw new Error("not implemented");
    },
    async expireSession() {
      throw new Error("not implemented");
    },
    async refund() {
      throw new Error("not implemented");
    },
    async verifyWebhook() {
      throw new Error("not implemented");
    },
  };
}
