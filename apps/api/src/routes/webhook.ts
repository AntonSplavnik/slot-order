import type { WebhookResponse } from "@slot-order/core";
import { Hono } from "hono";
import type { AppDeps } from "../app";
import type { StripeEvent } from "../payments/types";
import { InvalidStatusError, type Order, SlotFullError } from "../repo/types";

// `POST /webhooks/stripe` (docs/design.md §9.2): verify the raw body, reduce it to a StripeEvent, record
// the event id, handle it by type with the rules of §8.2, and after a failed handling delete the row so
// Stripe's retry is processed. Every status change is a conditional update, so even a retry that slips
// through cannot pay twice.

/** §9.2 step 4: the update, one re-read and the rule once more; a second miss is a failure (step 5). */
const MAX_ATTEMPTS = 2;

/** An error's message for the log; never a request body. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/** §9.3: the refund of a paid order whose slot could not be booked again, idempotent per order. */
async function refund(
  deps: AppDeps,
  orderId: string,
  paymentIntentId: string | null,
): Promise<void> {
  if (paymentIntentId === null) {
    // Stripe always sends the intent in `payment` mode; without one there is nothing to refund through
    // the API, so the operator has to (the order is cancelled/refunded_slot_full either way).
    console.error(`webhook: order ${orderId} needs a refund but its session has no payment intent`);
    return;
  }
  await deps.payments.refund(paymentIntentId, orderId);
}

/**
 * §8.2 `expired → paid` (the race of §8.4): `reserve_for_paid` books the slot again; on `slot_full` the
 * order is cancelled with `refunded_slot_full` first and refunded second (§9.3). `false` when the order
 * left `expired` before an update matched it.
 */
async function payExpired(
  deps: AppDeps,
  order: Order,
  paymentIntentId: string | null,
  now: Date,
): Promise<boolean> {
  const { capacityPerSlot } = await deps.repo.getSettings();
  try {
    await deps.repo.reserveForPaid(order.id, capacityPerSlot, paymentIntentId, now);
    return true;
  } catch (error) {
    // reserve_for_paid's conditional update matched no row: the order is no longer expired.
    if (error instanceof InvalidStatusError) return false;
    if (!(error instanceof SlotFullError)) throw error;
  }
  const cancelled = await deps.repo.transition(order.id, "expired", "cancelled", now, {
    cancelReason: "refunded_slot_full",
  });
  if (cancelled === null) return false;
  await refund(deps, order.id, paymentIntentId);
  return true;
}

/**
 * §9.2 step 4's rule for `checkout.session.completed` on one read of the order. `true` when it is done
 * (nothing to do included); `false` when a conditional update matched no row because the status moved
 * between the read and the update.
 */
async function applyCompleted(
  deps: AppDeps,
  order: Order,
  paymentIntentId: string | null,
  now: Date,
): Promise<boolean> {
  switch (order.status) {
    case "held": {
      // A paid session without an intent pays the order all the same (a guard; the column stays null).
      const paid = await deps.repo.transition(
        order.id,
        "held",
        "paid",
        now,
        paymentIntentId === null ? {} : { stripePaymentIntentId: paymentIntentId },
      );
      return paid !== null;
    }
    case "expired":
      return payExpired(deps, order, paymentIntentId, now);
    case "cancelled":
      // The retry after a refund that failed: refund once more (the idempotency key keeps it one refund).
      // Any other reason (stripe_failed, session_expired): nothing.
      if (order.cancelReason === "refunded_slot_full") {
        await refund(deps, order.id, paymentIntentId);
      }
      return true;
    default:
      // paid, ready, picked_up: paid already.
      return true;
  }
}

/** §9.2 step 4: the event's handling by type. Throws when it failed (step 5 then removes the row). */
async function handleEvent(deps: AppDeps, event: StripeEvent, now: Date): Promise<void> {
  if (event.orderId === null) return; // no order of ours: recorded, nothing else
  const orderId = event.orderId;

  if (event.type === "checkout.session.completed") {
    if (event.paymentStatus !== "paid") return; // recorded, nothing else
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const order = await deps.repo.getOrder(orderId);
      if (order === null) return; // an unknown order
      if (await applyCompleted(deps, order, event.paymentIntentId, now)) return;
    }
    throw new Error(`order ${orderId} moved twice while event ${event.id} was handled`);
  }

  if (event.type === "checkout.session.expired") {
    // §8.2 `held → cancelled`, the safety net for a cron that did not run; null (the order moved on
    // already, or is unknown) is fine.
    await deps.repo.releaseHold(orderId, "cancelled", "session_expired", now);
  }
  // Any other type: recorded, nothing else.
}

/** `POST /webhooks/stripe` (docs/design.md §9.2). */
export function webhookRoutes(deps: AppDeps) {
  return new Hono().post("/webhooks/stripe", async (c) => {
    const now = deps.now();
    // Steps 1–2: the raw body as sent (no JSON parsing before verification) and the signature header;
    // BadSignatureError → 400 bad_signature, an event without id and type (ZodError) → 400 validation.
    const rawBody = await c.req.text();
    const event = await deps.payments.verifyWebhook(
      rawBody,
      c.req.header("stripe-signature") ?? null,
      now,
    );

    // Step 3: the event id first; a duplicate does nothing.
    if (!(await deps.repo.recordStripeEvent(event.id, event.type, event.orderId))) {
      return c.json({ duplicate: true } satisfies WebhookResponse, 200);
    }

    // Steps 4–5: a failed handling removes the row, so Stripe's retry is processed, and answers 500
    // `internal` through onError. If the removal fails too, the event stays recorded (a retry is then a
    // duplicate: an operator's case) and the answer is still 500.
    try {
      await handleEvent(deps, event, now);
    } catch (error) {
      try {
        await deps.repo.deleteStripeEvent(event.id);
      } catch (deleteError) {
        console.error(
          `webhook: event ${event.id} stays recorded after a failed handling: ${messageOf(deleteError)}`,
        );
      }
      throw error;
    }
    return c.json({ received: true } satisfies WebhookResponse, 200);
  });
}
