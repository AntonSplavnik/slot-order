import { z } from "zod";
import type { Order } from "../repo/types";

// Payments (docs/design.md §9.4): the only way routes and the cron reach Stripe. Two implementations,
// `createStripePayments` (src/payments/stripe.ts) over the `stripe` package and `createFakePayments`
// (src/payments/fake.ts) for the tests, held to the same tests of §13.

/** Where Stripe sends the customer afterwards (§9.1). */
export type CheckoutUrls = { success: string; cancel: string };

/** What `createCheckout` answers: the session's id (stored on the order) and the URL the customer opens. */
export type CheckoutSession = { sessionId: string; url: string };

/** A verified webhook event reduced to what the handler reads (§9.2 step 2). */
export type StripeEvent = {
  id: string;
  type: string;
  /** `data.object.id`: the Checkout Session's id for the two Checkout events. */
  sessionId: string | null;
  /** `data.object.payment_status`: `paid`, `unpaid` or `no_payment_required` on a session. */
  paymentStatus: string | null;
  /** `data.object.payment_intent`: the id, also when Stripe expanded it into an object. */
  paymentIntentId: string | null;
  /** `data.object.metadata.order_id` when it is a UUID, else null (`stripe_events.order_id` is a uuid). */
  orderId: string | null;
};

/** Stripe failed or refused (network, a 4xx/5xx answer, a session without a URL); the original is `cause`. */
export class PaymentsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PaymentsError";
  }
}

/** The webhook's signature is missing, wrong or stale, or the body is not JSON (§9.2 step 1). */
export class BadSignatureError extends Error {
  constructor(message = "bad signature") {
    super(message);
    this.name = "BadSignatureError";
  }
}

export interface Payments {
  /** §9.1: the Checkout Session for a held order. Throws PaymentsError when Stripe fails. */
  createCheckout(order: Order, urls: CheckoutUrls, now: Date): Promise<CheckoutSession>;
  /** §8.4 step 2. Throws PaymentsError when Stripe refuses (the session is complete or already expired). */
  expireSession(sessionId: string): Promise<void>;
  /** §9.3, idempotent per order (`refund:<orderId>`). Throws PaymentsError. */
  refund(paymentIntentId: string, orderId: string): Promise<void>;
  /** §9.2 steps 1–2. Throws BadSignatureError; `signature` is the header, null when absent. */
  verifyWebhook(rawBody: string, signature: string | null, now: Date): Promise<StripeEvent>;
}

/** The subset of a Stripe event the handler reads (§9.2 step 2); every other field is dropped. */
export const RawStripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z
    .object({
      object: z
        .object({
          id: z.string().optional(),
          payment_status: z.string().optional(),
          payment_intent: z.union([z.string(), z.object({ id: z.string() }), z.null()]).optional(),
          metadata: z.record(z.string(), z.string()).nullable().optional(),
        })
        .optional(),
    })
    .optional(),
});

/** §9.2 step 2: a verified event reduced to `StripeEvent`. Throws a ZodError without `id` and `type`. */
export function stripeEventFromRaw(_raw: unknown): StripeEvent {
  throw new Error("not implemented");
}
