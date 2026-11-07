import {
  OrderSummarySchema,
  StaffBoardSchema,
  type WebhookResponse,
  WebhookResponseSchema,
} from "@slot-order/core";
import Stripe from "stripe";
import { describe, expect, test } from "vitest";
import { runCron } from "../../src/app";
import { createFakePayments } from "../../src/payments/fake";
import { createMemoryRepository } from "../../src/repo/memory";
import type { Repository } from "../../src/repo/types";
import {
  byLabel,
  colas,
  DAY,
  type DepsOverrides,
  expectError,
  expectJson,
  makeApp,
  NOW,
  payOrder,
  pickupCodeOf,
  placeOrder,
  plusMinutes,
  postWebhook,
  request,
  S,
  STAFF_TOKEN,
  type StripeEventFields,
  seconds,
  seedConfig,
  seedMenu,
  stripeEvent,
  type TestDeps,
  type TestResponse,
  UNKNOWN_ID,
  usageAt,
  type WebhookRequest,
} from "../helpers/app";

// docs/design.md §9.2 (the webhook's five steps: verify the raw body, reduce to StripeEvent, record the
// event id, handle by type, and on a failed handling delete the row and answer 500), §9.3 (cancel first,
// then refund; a retry refunds a cancelled/refunded_slot_full order again), §8.2 (held → paid, held →
// cancelled, expired → paid, expired → cancelled), §8.4 (the race with the cron), §10 and §10.1
// (WebhookResponse), §12 (bad_signature, validation, internal). The seed; now = Mon 2026-11-09 12:00
// Berlin (11:00Z) unless a test moves the clock; orders are one Burger Menu at S (12:30 Berlin), the
// first with the session cs_test_1. Events are signed by the app's fake payments with its test secret at
// the clock's instant: a real Stripe signature, verified for real, without the network.

const RECEIVED: WebhookResponse = { received: true };
const DUPLICATE: WebhookResponse = { duplicate: true };

/** `raw` signed by the app's fake at `at` (default: the clock's now). */
function sign(deps: TestDeps, raw: unknown, at: Date = deps.clock.now()) {
  return deps.payments.signedEvent(raw, at);
}

/** A `checkout.session.completed` for `orderId`: paid, payment intent pi_1, event evt_1, session cs_test_1. */
function completed(orderId: string | null, fields: Omit<StripeEventFields, "orderId"> = {}) {
  return stripeEvent({ ...fields, orderId });
}

/** A `checkout.session.expired` for `orderId`: unpaid, no payment intent. */
function expiredEvent(orderId: string | null, fields: Omit<StripeEventFields, "orderId"> = {}) {
  return stripeEvent({
    type: "checkout.session.expired",
    paymentStatus: "unpaid",
    paymentIntent: null,
    ...fields,
    orderId,
  });
}

/** 200 with exactly `body`, a WebhookResponse (§10.1). */
function expectWebhook(res: TestResponse, body: WebhookResponse): void {
  expectJson(res, 200, WebhookResponseSchema);
  expect(res.json).toEqual(body);
}

/** Whether `stripe_events` has no row for `id`. Probes by recording it, so call it last. */
async function eventIdFree(deps: TestDeps, id = "evt_1"): Promise<boolean> {
  return deps.repo.recordStripeEvent(id, "x", null);
}

/** An app with one held order (POST /orders at the clock's instant, session cs_test_1). */
async function heldOrder(overrides: DepsOverrides = {}) {
  const { app, deps } = makeApp(overrides);
  const order = await placeOrder(app);
  return { app, deps, order };
}

/** A fresh memory repository on the seed, for tests that wrap one of its methods (they use no `this`). */
function memoryRepository(): Repository {
  return createMemoryRepository({ settings: seedConfig, menu: seedMenu });
}

describe("POST /webhooks/stripe: checkout.session.completed (§9.2 step 4, §8.2 held → paid)", () => {
  const PAID_AT = "2026-11-09T11:03:00.000Z";

  test("paid, for a held order: 200 { received: true }; the order is paid at now with the payment intent", async () => {
    const { app, deps, order } = await heldOrder();
    deps.clock.set(PAID_AT);
    expectWebhook(await postWebhook(app, await sign(deps, completed(order.id))), RECEIVED);

    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      status: "paid",
      paidAt: new Date(PAID_AT),
      stripePaymentIntentId: "pi_1",
    });
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });

  test("the paid order shows its pickup code and appears on the staff board", async () => {
    const { app, deps, order } = await heldOrder();
    deps.clock.set(PAID_AT);
    expectWebhook(await postWebhook(app, await sign(deps, completed(order.id))), RECEIVED);

    const summary = expectJson(
      await request(app, "GET", `/orders/${order.id}`),
      200,
      OrderSummarySchema,
    );
    expect(summary).toMatchObject({ status: "paid", pickupCode: pickupCodeOf(1), paidAt: PAID_AT });
    const board = expectJson(
      await request(app, "GET", `/staff/orders?date=${DAY}`, { token: STAFF_TOKEN }),
      200,
      StaffBoardSchema,
    );
    expect(byLabel(board.slots, "12:30").orders.map((staffOrder) => staffOrder.id)).toEqual([
      order.id,
    ]);
  });

  test("the same signed request again: 200 { duplicate: true } and nothing changes, also a minute later", async () => {
    const { app, deps, order } = await heldOrder();
    const signed = await sign(deps, completed(order.id));
    expectWebhook(await postWebhook(app, signed), RECEIVED);
    const paid = await deps.repo.getOrder(order.id);
    expect(paid?.paidAt).toEqual(new Date(NOW));

    expectWebhook(await postWebhook(app, signed), DUPLICATE);
    deps.clock.set(plusMinutes(NOW, 1));
    expectWebhook(await postWebhook(app, signed), DUPLICATE);

    expect(await deps.repo.getOrder(order.id)).toEqual(paid);
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
    expect(await eventIdFree(deps, "evt_1")).toBe(false);
  });

  test("another event id completing the already paid order: 200 { received: true }, nothing changes", async () => {
    const { app, deps, order } = await heldOrder();
    expectWebhook(await postWebhook(app, await sign(deps, completed(order.id))), RECEIVED);
    const paid = await deps.repo.getOrder(order.id);

    deps.clock.set(plusMinutes(NOW, 2));
    const other = completed(order.id, { id: "evt_2", paymentIntent: "pi_2" });
    expectWebhook(await postWebhook(app, await sign(deps, other)), RECEIVED);

    expect(await deps.repo.getOrder(order.id)).toEqual(paid);
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
    expect(deps.payments.calls.refund).toEqual([]);
  });

  test("a payment intent Stripe expanded into an object: its id is stored", async () => {
    const { app, deps, order } = await heldOrder();
    const event = completed(order.id, { paymentIntent: { id: "pi_obj" } });
    expectWebhook(await postWebhook(app, await sign(deps, event)), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      status: "paid",
      stripePaymentIntentId: "pi_obj",
    });
  });

  // SPEC: §9.2 does not say what a paid session without a payment intent does; §10.2 lets
  // reserveForPaid take a null intent "(a completed session without one, §9.2)", so the payment counts:
  // the order is paid, its stripePaymentIntentId null.
  test("paid without a payment intent: the order is paid all the same, with stripePaymentIntentId null", async () => {
    const { app, deps, order } = await heldOrder();
    const event = completed(order.id, { paymentIntent: null });
    expectWebhook(await postWebhook(app, await sign(deps, event)), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      status: "paid",
      paidAt: new Date(NOW),
      stripePaymentIntentId: null,
    });
  });

  test("payment_status unpaid: 200 { received: true }, the order stays held; the event is recorded", async () => {
    const { app, deps, order } = await heldOrder();
    const signed = await sign(deps, completed(order.id, { paymentStatus: "unpaid" }));
    expectWebhook(await postWebhook(app, signed), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({ status: "held", paidAt: null });

    expectWebhook(await postWebhook(app, signed), DUPLICATE);
  });

  test("for an order cancelled for another reason (session_expired): 200 { received: true }, nothing, no refund", async () => {
    const { app, deps, order } = await heldOrder();
    await deps.repo.releaseHold(order.id, "cancelled", "session_expired", deps.now());
    const cancelled = await deps.repo.getOrder(order.id);

    deps.clock.set(plusMinutes(NOW, 1));
    expectWebhook(await postWebhook(app, await sign(deps, completed(order.id))), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toEqual(cancelled);
    expect(deps.payments.calls.refund).toEqual([]);
    expect(await usageAt(deps, S)).toEqual({ booked: 0, capacity: 20 });
  });
});

describe("POST /webhooks/stripe verifies the raw body's signature first (§9.2 step 1)", () => {
  /** Signs `payload` exactly as given, the way Stripe would (the fake signs only JSON.stringify(raw)). */
  function signRaw(deps: TestDeps, payload: string): WebhookRequest {
    const signature = new Stripe("sk_test_offline").webhooks.generateTestHeaderString({
      payload,
      secret: deps.payments.webhookSecret,
      timestamp: seconds(deps.clock.now()),
    });
    return { body: payload, signature };
  }

  test.each<[string, (deps: TestDeps, raw: unknown) => Promise<WebhookRequest>]>([
    [
      "no Stripe-Signature header",
      async (deps, raw) => ({ ...(await sign(deps, raw)), signature: null }),
    ],
    [
      "a signature made with another secret",
      async (deps, raw) =>
        createFakePayments({ webhookSecret: "whsec_other" }).signedEvent(raw, deps.clock.now()),
    ],
    [
      "the signed body with a space appended",
      async (deps, raw) => {
        const signed = await sign(deps, raw);
        return { ...signed, body: `${signed.body} ` };
      },
    ],
    [
      "a signature made 6 minutes ago (the tolerance is 300 s)",
      async (deps, raw) => sign(deps, raw, new Date(deps.clock.now().getTime() - 360_000)),
    ],
    [
      "a header that is not a Stripe signature",
      async (deps, raw) => ({ ...(await sign(deps, raw)), signature: "nonsense" }),
    ],
    ["a correctly signed body that is not JSON", async (deps) => signRaw(deps, "not json")],
  ])(
    "%s: 400 bad_signature; nothing is recorded and the order stays held",
    async (_case, build) => {
      const { app, deps, order } = await heldOrder();
      const res = await postWebhook(app, await build(deps, completed(order.id)));
      expectError(res, 400, "bad_signature");

      expect(await deps.repo.getOrder(order.id)).toMatchObject({ status: "held", paidAt: null });
      expect(await eventIdFree(deps, "evt_1")).toBe(true);
    },
  );

  test("a signature made 4 minutes ago is accepted (within the 300 s tolerance)", async () => {
    const { app, deps, order } = await heldOrder();
    const signed = await sign(deps, completed(order.id), new Date(NOW));
    deps.clock.set(plusMinutes(NOW, 4));
    expectWebhook(await postWebhook(app, signed), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      status: "paid",
      paidAt: new Date(plusMinutes(NOW, 4)),
    });
  });

  test("the body is verified as sent, before any parsing: Stripe's pretty-printed JSON is accepted", async () => {
    const { app, deps, order } = await heldOrder();
    const pretty = JSON.stringify(completed(order.id), null, 2);
    expectWebhook(await postWebhook(app, signRaw(deps, pretty)), RECEIVED);
    expect((await deps.repo.getOrder(order.id))?.status).toBe("paid");
  });

  test("a signed event without id and type ({ object: 'event' }): 400 validation (§9.2 step 2)", async () => {
    const { app, deps } = makeApp();
    const res = await postWebhook(app, await sign(deps, { object: "event" }));
    expect(expectError(res, 400, "validation").issues?.length).toBeGreaterThan(0);
  });
});

describe("POST /webhooks/stripe records events for no order of ours and answers 200 (§9.2 steps 2–4)", () => {
  test.each<[string, string | null]>([
    ["an unknown order id", UNKNOWN_ID],
    ["no metadata at all", null],
    ["an order_id that is not a UUID ('abc')", "abc"],
  ])(
    "checkout.session.completed with %s: 200 { received: true }; recorded (a replay is a duplicate)",
    async (_case, orderId) => {
      const { app, deps } = makeApp();
      const signed = await sign(deps, completed(orderId, { sessionId: "cs_test_elsewhere" }));
      expectWebhook(await postWebhook(app, signed), RECEIVED);
      expectWebhook(await postWebhook(app, signed), DUPLICATE);
      expect(deps.payments.calls.refund).toEqual([]);
    },
  );

  test("checkout.session.expired for an unknown order: 200 { received: true }; recorded", async () => {
    const { app, deps } = makeApp();
    const signed = await sign(deps, expiredEvent(UNKNOWN_ID, { sessionId: "cs_test_elsewhere" }));
    expectWebhook(await postWebhook(app, signed), RECEIVED);
    expectWebhook(await postWebhook(app, signed), DUPLICATE);
  });

  test("an unhandled type (payment_intent.succeeded) naming our held order: 200 received, recorded, the order untouched", async () => {
    const { app, deps, order } = await heldOrder();
    const signed = await sign(
      deps,
      stripeEvent({ type: "payment_intent.succeeded", sessionId: "pi_1", orderId: order.id }),
    );
    expectWebhook(await postWebhook(app, signed), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({ status: "held", paidAt: null });
    expectWebhook(await postWebhook(app, signed), DUPLICATE);
  });
});

describe("POST /webhooks/stripe: checkout.session.expired (§8.2 held → cancelled, the safety net)", () => {
  test("on a held order (the cron never ran; Stripe's own expiry at 11:31Z): cancelled with session_expired, the slot free", async () => {
    const { app, deps, order } = await heldOrder();
    const at = "2026-11-09T11:31:00.000Z";
    deps.clock.set(at);
    expectWebhook(await postWebhook(app, await sign(deps, expiredEvent(order.id))), RECEIVED);

    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      status: "cancelled",
      cancelReason: "session_expired",
      cancelledAt: new Date(at),
      holdExpiresAt: null,
      paidAt: null,
    });
    expect(await usageAt(deps, S)).toEqual({ booked: 0, capacity: 20 });
  });

  test("on an order the cron expired already: 200 { received: true }; it stays expired, without cancelledAt", async () => {
    const { app, deps, order } = await heldOrder();
    deps.clock.set("2026-11-09T11:11:00Z");
    await runCron(deps);
    const expired = await deps.repo.getOrder(order.id);
    expect(expired?.status).toBe("expired");

    deps.clock.set("2026-11-09T11:12:00Z");
    expectWebhook(await postWebhook(app, await sign(deps, expiredEvent(order.id))), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toEqual(expired);
    expect(expired?.cancelledAt).toBeNull();
    expect(await usageAt(deps, S)).toEqual({ booked: 0, capacity: 20 });
  });

  test("on a paid order: 200 { received: true }; it stays paid with its item booked", async () => {
    const { app, deps, order } = await heldOrder();
    await payOrder(deps, order.id);
    const paid = await deps.repo.getOrder(order.id);

    deps.clock.set("2026-11-09T11:05:00Z");
    expectWebhook(await postWebhook(app, await sign(deps, expiredEvent(order.id))), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toEqual(paid);
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });
});

describe("POST /webhooks/stripe: paid after the cron expired the hold (§8.4 the race, §9.3)", () => {
  test("the slot still has room: reserve_for_paid books it again and the order is paid; no refund", async () => {
    const { app, deps, order } = await heldOrder();
    deps.clock.set("2026-11-09T11:11:00Z");
    expect(await runCron(deps)).toMatchObject({ released: 1 });
    expect(await usageAt(deps, S)).toEqual({ booked: 0, capacity: 20 });

    expectWebhook(await postWebhook(app, await sign(deps, completed(order.id))), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      status: "paid",
      paidAt: new Date("2026-11-09T11:11:00Z"),
      stripePaymentIntentId: "pi_1",
    });
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
    expect(deps.payments.calls.refund).toEqual([]);
  });

  // S must still be bookable for the second order once A's hold has run out, so A is placed at 10:55Z
  // (held until 11:05Z) and the cron runs at 11:06Z: by 11:11Z S would be too soon (prep 20 minutes,
  // §6.1), and a second POST /orders for S would be refused with slot_too_soon.
  const A_PLACED_AT = "2026-11-09T10:55:00.000Z";
  const CRON_AT = "2026-11-09T11:06:00.000Z";
  const PAID_AT = "2026-11-09T11:07:00.000Z";

  /** Order A held, then expired by the cron (its item released); then Grace's cola ×20 fills S. */
  async function raceWithFullSlot() {
    const { app, deps } = makeApp();
    deps.clock.set(A_PLACED_AT);
    const a = await placeOrder(app);
    deps.clock.set(CRON_AT);
    expect(await runCron(deps)).toMatchObject({ released: 1 });
    await placeOrder(app, { ...colas(20), customerName: "Grace" });
    expect(await usageAt(deps, S)).toEqual({ booked: 20, capacity: 20 });
    deps.clock.set(PAID_AT);
    return { app, deps, a };
  }

  test("the slot filled up meanwhile: A is cancelled with refunded_slot_full, then refunded; still 200", async () => {
    const { app, deps, a } = await raceWithFullSlot();
    expectWebhook(await postWebhook(app, await sign(deps, completed(a.id))), RECEIVED);

    expect(await deps.repo.getOrder(a.id)).toMatchObject({
      status: "cancelled",
      cancelReason: "refunded_slot_full",
      cancelledAt: new Date(PAID_AT),
      expiredAt: new Date(CRON_AT),
      paidAt: null,
    });
    expect(deps.payments.calls.refund).toEqual([{ paymentIntentId: "pi_1", orderId: a.id }]);
    expect(await usageAt(deps, S)).toEqual({ booked: 20, capacity: 20 });

    const summary = expectJson(
      await request(app, "GET", `/orders/${a.id}`),
      200,
      OrderSummarySchema,
    );
    expect(summary).toMatchObject({
      status: "cancelled",
      cancelReason: "refunded_slot_full",
      cancelledAt: PAID_AT,
    });
    expect(summary).not.toHaveProperty("pickupCode");
  });

  test("the refund fails: 500 internal with A cancelled already; Stripe's retry is handled, not a duplicate, and refunds again", async () => {
    const { app, deps, a } = await raceWithFullSlot();
    deps.payments.fail("refund");
    const signed = await sign(deps, completed(a.id));
    expectError(await postWebhook(app, signed), 500, "internal");
    // Cancel first, then refund (§9.3).
    expect(await deps.repo.getOrder(a.id)).toMatchObject({
      status: "cancelled",
      cancelReason: "refunded_slot_full",
      cancelledAt: new Date(PAID_AT),
    });
    expect(deps.payments.calls.refund).toHaveLength(1);

    deps.payments.fail("refund", false);
    deps.clock.set(plusMinutes(PAID_AT, 1));
    expectWebhook(await postWebhook(app, signed), RECEIVED);
    expect(deps.payments.calls.refund).toEqual([
      { paymentIntentId: "pi_1", orderId: a.id },
      { paymentIntentId: "pi_1", orderId: a.id },
    ]);
    expect(await deps.repo.getOrder(a.id)).toMatchObject({
      status: "cancelled",
      cancelReason: "refunded_slot_full",
      cancelledAt: new Date(PAID_AT),
    });
    expect(await usageAt(deps, S)).toEqual({ booked: 20, capacity: 20 });
  });
});

describe("POST /webhooks/stripe: a failed handling removes the event row and answers 500 (§9.2 step 5)", () => {
  test("the repository fails once: 500 internal, the order still held; the same request again pays it", async () => {
    const memory = memoryRepository();
    let failures = 1;
    const repo: Repository = {
      ...memory,
      transition: async (...args) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("db down");
        }
        return memory.transition(...args);
      },
    };
    const { app, deps, order } = await heldOrder({ repo });
    const signed = await sign(deps, completed(order.id));

    const res = await postWebhook(app, signed);
    expectError(res, 500, "internal");
    expect(res.text).not.toContain("db down");
    expect(await deps.repo.getOrder(order.id)).toMatchObject({ status: "held", paidAt: null });

    expectWebhook(await postWebhook(app, signed), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      status: "paid",
      stripePaymentIntentId: "pi_1",
    });
  });

  test("the order moves between the read and the update: it is read again and the rule applied once more", async () => {
    // The first conditional update finds the hold expired in between (the cron's release_hold), so it
    // matches no row; read again, the order is expired, and reserve_for_paid pays it.
    const memory = memoryRepository();
    let interleaved = false;
    const repo: Repository = {
      ...memory,
      transition: async (id, from, to, at, patch) => {
        if (!interleaved) {
          interleaved = true;
          await memory.releaseHold(id, "expired", null, at);
        }
        return memory.transition(id, from, to, at, patch);
      },
    };
    const { app, deps, order } = await heldOrder({ repo });

    expectWebhook(await postWebhook(app, await sign(deps, completed(order.id))), RECEIVED);
    expect(await deps.repo.getOrder(order.id)).toMatchObject({
      status: "paid",
      paidAt: new Date(NOW),
      expiredAt: new Date(NOW),
      stripePaymentIntentId: "pi_1",
    });
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });

  test("a second miss is a failure: 500 internal, the row removed, so the same request is handled (and fails) again", async () => {
    const memory = memoryRepository();
    let attempts = 0;
    const repo: Repository = {
      ...memory,
      transition: async () => {
        attempts += 1;
        return null;
      },
    };
    const { app, deps, order } = await heldOrder({ repo });
    const signed = await sign(deps, completed(order.id));

    expectError(await postWebhook(app, signed), 500, "internal");
    // §9.2 step 4: the update, one re-read and the update once more; a second miss is step 5.
    expect(attempts).toBe(2);
    expectError(await postWebhook(app, signed), 500, "internal");
    expect(attempts).toBe(4);
    expect((await deps.repo.getOrder(order.id))?.status).toBe("held");
    expect(await eventIdFree(deps, "evt_1")).toBe(true);
  });

  // SPEC: §9.2 step 5 says a failed deletion is logged and the event stays recorded, not what the response
  // is then; the handling failed either way, so it stays 500 internal, and Stripe's retry meets the
  // recorded row as a duplicate.
  test("removing the row fails too: still 500 internal, and the event stays recorded (a replay is a duplicate)", async () => {
    const memory = memoryRepository();
    const repo: Repository = {
      ...memory,
      transition: async () => {
        throw new Error("db down");
      },
      deleteStripeEvent: async () => {
        throw new Error("db still down");
      },
    };
    const { app, deps, order } = await heldOrder({ repo });
    const signed = await sign(deps, completed(order.id));

    expectError(await postWebhook(app, signed), 500, "internal");
    expectWebhook(await postWebhook(app, signed), DUPLICATE);
    expect((await deps.repo.getOrder(order.id))?.status).toBe("held");
  });
});

describe("POST /webhooks/stripe: access (§10, §10.5)", () => {
  test("needs no staff token and ignores the Origin header: a request from a foreign origin is handled", async () => {
    const { app, deps, order } = await heldOrder();
    const signed = await sign(deps, completed(order.id));
    const res = await postWebhook(app, signed, { Origin: "https://evil.example" });
    expectWebhook(res, RECEIVED);
    expect((await deps.repo.getOrder(order.id))?.status).toBe("paid");
  });
});
