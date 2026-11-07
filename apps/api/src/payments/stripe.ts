import type Stripe from "stripe";
import type { Order } from "../repo/types";
import type { CheckoutUrls, Payments } from "./types";

// The Stripe adapter (docs/design.md §9.4) over the `stripe` package: §9.1 Checkout Sessions, §8.4 step 2,
// §9.3 refunds, §9.2 signature verification with Web Crypto. Not implemented yet (the M5 contract).

/**
 * The part of a `Stripe` instance the adapter uses. A real `Stripe` satisfies it; so does a recording stub
 * in the tests. `create` answers at least the session's id and URL.
 */
export type StripeClient = {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<{ id: string; url: string | null }>;
      expire(id: string): Promise<unknown>;
    };
  };
  refunds: {
    create(params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions): Promise<unknown>;
  };
  webhooks: {
    constructEventAsync(
      payload: string,
      header: string,
      secret: string,
      tolerance?: number,
      cryptoProvider?: Stripe.CryptoProvider,
      receivedAt?: number,
    ): Promise<Stripe.Event>;
  };
};

/** §9.1 as the parameters of `checkout.sessions.create`: pure, so the tests and the fake share it. */
export function checkoutSessionParams(
  _order: Order,
  _urls: CheckoutUrls,
  _now: Date,
): Stripe.Checkout.SessionCreateParams {
  throw new Error("not implemented");
}

export function createStripePayments(_stripe: StripeClient, _webhookSecret: string): Payments {
  return {
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
