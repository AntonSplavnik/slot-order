import { describe, expect, test } from "vitest";
import { ZodError } from "zod";
import { stripeEventFromRaw } from "../../src/payments/types";

// docs/design.md §9.2 step 2, §9.4 stripeEventFromRaw: a verified Stripe event reduced to the StripeEvent
// subset: `id` and `type` (required), and from `data.object` the session id, `payment_status`, the
// payment intent (a string, or the `id` of an expanded object, else null) and `orderId` =
// `metadata.order_id` when it is a UUID, else null. Every other field is dropped.

const ORDER_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";

/** A `checkout.session.completed` as Stripe sends it, with many fields the reduction ignores. */
function fullEvent(object: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    object: "event",
    api_version: "2026-10-29.clover",
    created: 1794222000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        amount_total: 1290,
        client_reference_id: ORDER_ID,
        currency: "eur",
        customer_details: { email: "customer@example.com", name: null },
        metadata: { order_id: ORDER_ID, source: "web" },
        mode: "payment",
        payment_intent: "pi_1",
        payment_status: "paid",
        status: "complete",
        url: null,
        ...object,
      },
      previous_attributes: { status: "open" },
    },
  };
}

/** `fullEvent` with `data.object`'s `key` removed. */
function without(key: string) {
  const event = fullEvent();
  const object = Object.fromEntries(
    Object.entries(event.data.object).filter(([name]) => name !== key),
  );
  return { ...event, data: { ...event.data, object } };
}

const NO_OBJECT_FIELDS = {
  sessionId: null,
  paymentStatus: null,
  paymentIntentId: null,
  orderId: null,
};

describe("stripeEventFromRaw (§9.2 step 2)", () => {
  test("a full Stripe event: the six fields and nothing else", () => {
    const reduced = stripeEventFromRaw(fullEvent());
    expect(reduced).toEqual({
      id: "evt_1",
      type: "checkout.session.completed",
      sessionId: "cs_test_1",
      paymentStatus: "paid",
      paymentIntentId: "pi_1",
      orderId: ORDER_ID,
    });
    expect(Object.keys(reduced).sort()).toEqual([
      "id",
      "orderId",
      "paymentIntentId",
      "paymentStatus",
      "sessionId",
      "type",
    ]);
  });

  test("a payment intent Stripe expanded into an object: its id", () => {
    const event = fullEvent({
      payment_intent: { id: "pi_obj", object: "payment_intent", amount: 1290, status: "succeeded" },
    });
    expect(stripeEventFromRaw(event).paymentIntentId).toBe("pi_obj");
  });

  test("payment_intent null or absent: paymentIntentId null", () => {
    expect(stripeEventFromRaw(fullEvent({ payment_intent: null })).paymentIntentId).toBeNull();
    expect(stripeEventFromRaw(without("payment_intent")).paymentIntentId).toBeNull();
  });

  test("payment_status and the object's id absent: null", () => {
    expect(stripeEventFromRaw(without("payment_status")).paymentStatus).toBeNull();
    expect(stripeEventFromRaw(without("id")).sessionId).toBeNull();
  });

  test.each<[string, unknown]>([
    ["no metadata", without("metadata")],
    ["metadata null", fullEvent({ metadata: null })],
    ["metadata without order_id", fullEvent({ metadata: { source: "web" } })],
    ["an order_id that is not a UUID ('abc')", fullEvent({ metadata: { order_id: "abc" } })],
    ["an empty order_id", fullEvent({ metadata: { order_id: "" } })],
  ])("%s: orderId null, the rest kept", (_case, event) => {
    expect(stripeEventFromRaw(event)).toEqual({
      id: "evt_1",
      type: "checkout.session.completed",
      sessionId: "cs_test_1",
      paymentStatus: "paid",
      paymentIntentId: "pi_1",
      orderId: null,
    });
  });

  test("an order_id that is a UUID is kept as it is", () => {
    const other = "00000000-0000-4000-8000-00000000002a";
    expect(stripeEventFromRaw(fullEvent({ metadata: { order_id: other } })).orderId).toBe(other);
  });

  test.each<[string, unknown]>([
    ["only id and type", { id: "evt_2", type: "charge.refunded" }],
    ["no data.object", { id: "evt_2", type: "charge.refunded", data: {} }],
    ["an empty data.object", { id: "evt_2", type: "charge.refunded", data: { object: {} } }],
  ])("%s: the four object fields null", (_case, raw) => {
    expect(stripeEventFromRaw(raw)).toEqual({
      id: "evt_2",
      type: "charge.refunded",
      ...NO_OBJECT_FIELDS,
    });
  });

  test.each<[string, unknown]>([
    ["no id", { type: "checkout.session.completed", data: { object: {} } }],
    ["no type", { id: "evt_1", data: { object: {} } }],
    ["an empty id", { id: "", type: "checkout.session.completed" }],
    ["{ object: 'event' } alone", { object: "event" }],
    ["null", null],
    ["a string", "evt_1"],
    ["an array", [{ id: "evt_1", type: "t" }]],
  ])("%s: throws a ZodError", (_case, raw) => {
    expect(() => stripeEventFromRaw(raw)).toThrow(ZodError);
  });
});
