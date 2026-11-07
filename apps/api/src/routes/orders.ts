import {
  CreateOrderRequestSchema,
  type CreateOrderResponse,
  checkSlot,
  holdExpiry,
  pickupCode,
  priceCart,
} from "@slot-order/core";
import { Hono } from "hono";
import type { AppDeps } from "../app";
import { ApiError } from "../errors";
import { type CheckoutSession, PaymentsError } from "../payments/types";
import type { Order } from "../repo/types";
import { orderSummary } from "./present";
import { orderIdParam, readJson } from "./shared";

/** The bytes of a pickup code (§8.3). */
const PICKUP_CODE_BYTES = 8;

/**
 * §9.1, §8.2: the Checkout Session for a held order. A PaymentsError releases the hold as
 * cancelled/stripe_failed and answers 502 `payment_unavailable`.
 */
async function checkoutOrRelease(deps: AppDeps, order: Order, now: Date): Promise<CheckoutSession> {
  const urls = {
    success: `${deps.webOrigin}/orders/${order.id}?paid=1`,
    cancel: `${deps.webOrigin}/orders/${order.id}`,
  };
  try {
    return await deps.payments.createCheckout(order, urls, now);
  } catch (error) {
    if (!(error instanceof PaymentsError)) throw error;
    await deps.repo.releaseHold(order.id, "cancelled", "stripe_failed", now);
    throw new ApiError("payment_unavailable");
  }
}

/** `POST /orders` and `GET /orders/:id` (docs/design.md §10). */
export function orderRoutes(deps: AppDeps) {
  return (
    new Hono()
      // In the order of §10: validate, price, settings, usage, checkSlot, pickup code, placeHold, then
      // the Checkout Session and setCheckout. The body's own totals, if any, are not read: the server
      // prices.
      .post("/orders", async (c) => {
        const request = CreateOrderRequestSchema.parse(await readJson(c));
        const now = deps.now();
        const receipt = priceCart(await deps.repo.getMenu(), {
          lines: request.lines,
          ...(request.promoCode === undefined ? {} : { promoCode: request.promoCode }),
        });
        const config = await deps.repo.getSettings();
        const start = new Date(request.slotStart);
        const booked = await deps.repo.getSlotUsage(start, new Date(start.getTime() + 1));
        const check = checkSlot(config, start, receipt.itemCount, now, booked);
        if (!check.ok) throw new ApiError(check.code);

        const order = await deps.repo.placeHold(
          {
            slotStart: check.slot.start,
            customerName: request.customerName,
            lines: receipt.lines,
            receipt,
            itemCount: receipt.itemCount,
            totalCents: receipt.totalCents,
            promoCode: receipt.promoCode ?? null,
            pickupCode: pickupCode(deps.randomBytes(PICKUP_CODE_BYTES)),
          },
          config.capacityPerSlot,
          holdExpiry(config, now),
        );
        // §9.1, §8.2: Stripe is asked only once the slot is held. Its failure releases the hold as
        // cancelled/stripe_failed and answers 502. A failing setCheckout is a 500 that leaves the order
        // held without a session; the cron releases it (§10, §8.4).
        const { sessionId, url } = await checkoutOrRelease(deps, order, now);
        await deps.repo.setCheckout(order.id, sessionId, url);
        const body: CreateOrderResponse = {
          order: orderSummary({ ...order, stripeSessionId: sessionId, checkoutUrl: url }, config),
          checkoutUrl: url,
        };
        return c.json(body, 201);
      })
      .get("/orders/:id", async (c) => {
        const id = orderIdParam(c);
        const order = await deps.repo.getOrder(id);
        if (order === null) throw new ApiError("order_not_found");
        return c.json(orderSummary(order, await deps.repo.getSettings()));
      })
  );
}
