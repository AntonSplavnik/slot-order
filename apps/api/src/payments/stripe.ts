import type { PricedLine } from "@slot-order/core";
import Stripe from "stripe";
import type { Order } from "../repo/types";
import {
  BadSignatureError,
  type CheckoutUrls,
  type Payments,
  PaymentsError,
  type StripeEvent,
  stripeEventFromRaw,
} from "./types";

// The Stripe adapter (docs/design.md §9.4) over the `stripe` package: §9.1 Checkout Sessions, §8.4 step 2,
// §9.3 refunds, §9.2 signature verification with Web Crypto. Every Stripe failure becomes a PaymentsError
// with the original as `cause`; nothing here logs, and no key or secret ever reaches a message.

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

/** §9.1: Stripe's minimum session expiry is 30 minutes on its clock; one more absorbs the round trip. */
const SESSION_EXPIRY_MS = 31 * 60_000;

/** §9.2 step 1: the signature may be at most 300 s old, measured from the app's `now`. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * §9.1 a line item's name: the line's name, its option names in parentheses, the quantity in front when
 * it is more than one ("2 × Chicken Burger (large, garlic)", "Burger Menu").
 */
function lineItemName(line: PricedLine): string {
  const options = line.optionNames.length > 0 ? ` (${line.optionNames.join(", ")})` : "";
  const quantity = line.quantity > 1 ? `${line.quantity} × ` : "";
  return `${quantity}${line.name}${options}`;
}

/** §9.1 as the parameters of `checkout.sessions.create`: pure, so the tests and the fake share it. */
export function checkoutSessionParams(
  order: Order,
  urls: CheckoutUrls,
  now: Date,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    // One item per priced line at the line's discounted gross, quantity 1: the cents match ours and the
    // items sum to the receipt's total, combos and promo codes included. The customer's name stays here.
    line_items: order.lines.map((line) => ({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: line.lineGrossCents - line.discountCents,
        product_data: { name: lineItemName(line) },
      },
    })),
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    // Epoch seconds, floored to the second.
    expires_at: Math.floor((now.getTime() + SESSION_EXPIRY_MS) / 1000),
    success_url: urls.success,
    cancel_url: urls.cancel,
  };
}

/**
 * §9.2 steps 1–2, shared by the adapter and the fake: the raw body's signature checked with the Web Crypto
 * provider (Workers have no synchronous HMAC, §17) against `secret`, with the 300 s tolerance measured from
 * `now` (`receivedAt` in milliseconds: the library divides by 1000 itself). A missing header, a bad or
 * stale signature, or a body that is not JSON → BadSignatureError; then the reduction to `StripeEvent`,
 * whose ZodError (no `id` or `type`) propagates: the route answers 400 `validation`.
 */
export async function verifyStripeWebhook(
  webhooks: StripeClient["webhooks"],
  secret: string,
  rawBody: string,
  signature: string | null,
  now: Date,
): Promise<StripeEvent> {
  if (signature === null) throw new BadSignatureError("missing Stripe-Signature header");
  let event: Stripe.Event;
  try {
    event = await webhooks.constructEventAsync(
      rawBody,
      signature,
      secret,
      SIGNATURE_TOLERANCE_SECONDS,
      Stripe.createSubtleCryptoProvider(),
      now.getTime(),
    );
  } catch {
    // Stripe's message quotes the header and the payload; neither goes further.
    throw new BadSignatureError();
  }
  return stripeEventFromRaw(event);
}

/** Runs one Stripe call; whatever it throws becomes a PaymentsError with the original as `cause`. */
async function stripeCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new PaymentsError(`Stripe ${operation} failed`, { cause: error });
  }
}

/** §9.4: `Payments` over a `Stripe` instance (production: `new Stripe(STRIPE_SECRET_KEY)`). */
export function createStripePayments(stripe: StripeClient, webhookSecret: string): Payments {
  return {
    // §9.1. An answer without a URL is a failure too.
    async createCheckout(order, urls, now) {
      const session = await stripeCall("checkout.sessions.create", () =>
        stripe.checkout.sessions.create(checkoutSessionParams(order, urls, now)),
      );
      if (session.url === null || session.url === "") {
        throw new PaymentsError(`Stripe answered session ${session.id} without a URL`);
      }
      return { sessionId: session.id, url: session.url };
    },

    // §8.4 step 2: refused for a session that is complete or expired already.
    async expireSession(sessionId) {
      await stripeCall("checkout.sessions.expire", () =>
        stripe.checkout.sessions.expire(sessionId),
      );
    },

    // §9.3: the idempotency key makes a retry answer the same refund instead of a second one.
    async refund(paymentIntentId, orderId) {
      await stripeCall("refunds.create", () =>
        stripe.refunds.create(
          { payment_intent: paymentIntentId },
          { idempotencyKey: `refund:${orderId}` },
        ),
      );
    },

    async verifyWebhook(rawBody, signature, now) {
      return verifyStripeWebhook(stripe.webhooks, webhookSecret, rawBody, signature, now);
    },
  };
}
