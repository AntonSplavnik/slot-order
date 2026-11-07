import {
  type OrderSummary,
  priceCart,
  StaffBoardSchema,
  type StaffOrder,
  StaffOrderSchema,
  type StaffSlot,
  slotGrid,
} from "@slot-order/core";
import { describe, expect, test } from "vitest";
import {
  BURGER,
  byLabel,
  DAY,
  expectError,
  expectJson,
  makeApp,
  payOrder,
  pickupCodeOf,
  placeOrder,
  request,
  S,
  STAFF_TOKEN,
  seedConfig,
  seedMenu,
  type TestApp,
  type TestDeps,
  UNKNOWN_ID,
} from "../helpers/app";

// docs/design.md §10 (GET /staff/orders, POST /staff/orders/:id/ready, POST /staff/pickup), §10.1
// StaffOrder / StaffSlot / StaffBoard / PickupRequest, §10.4 (Bearer STAFF_TOKEN on every /staff/* route),
// §8.2 (paid → ready, paid | ready → picked_up), §8.3 (normalizePickupCode), §12.
// The seed; the clock starts at Mon 2026-11-09 12:00 Berlin (11:00Z); orders are one Burger Menu at 12:30.

const RECEIPT = priceCart(seedMenu, BURGER);
const PAID_AT = "2026-11-09T11:03:00.000Z";
const READY_AT = "2026-11-09T11:20:00.000Z";
const PICKED_UP_AT = "2026-11-09T11:35:00.000Z";

/** An order placed at the clock's instant, then paid at PAID_AT (the clock stays there). */
async function paidOrder(
  app: TestApp,
  deps: TestDeps,
  customerName = "Ada",
): Promise<OrderSummary> {
  const order = await placeOrder(app, { customerName });
  deps.clock.set(PAID_AT);
  await payOrder(deps, order.id);
  return order;
}

/** The StaffOrder of a paid one-Burger-Menu order at 12:30 whose pickup code came from the `call`-th bytes. */
function staffOrder(
  order: OrderSummary,
  call: number,
  fields: Partial<StaffOrder> = {},
): StaffOrder {
  return {
    id: order.id,
    status: "paid",
    pickupCode: pickupCodeOf(call),
    customerName: order.customerName,
    slotStart: S,
    slotLabel: "12:30",
    lines: RECEIPT.lines,
    itemCount: 1,
    totalCents: 1290,
    paidAt: PAID_AT,
    ...fields,
  };
}

/** Every grid slot of `day` with nothing booked: what the board shows of a day without orders. */
function emptySlots(day: string): StaffSlot[] {
  return slotGrid(seedConfig, day).map((slot) => ({
    start: slot.start.toISOString(),
    label: slot.label,
    booked: 0,
    capacity: 20,
    orders: [],
  }));
}

async function getBoard(app: TestApp, query = `?date=${DAY}`) {
  const res = await request(app, "GET", `/staff/orders${query}`, { token: STAFF_TOKEN });
  return expectJson(res, 200, StaffBoardSchema);
}

async function markReady(app: TestApp, id: string) {
  return request(app, "POST", `/staff/orders/${id}/ready`, { token: STAFF_TOKEN });
}

async function pickUp(app: TestApp, body: unknown) {
  return request(app, "POST", "/staff/pickup", { token: STAFF_TOKEN, body });
}

describe("staff authentication (§10.4): anything but Bearer STAFF_TOKEN is 401 unauthorized", () => {
  const routes: { method: string; path: string; body?: unknown }[] = [
    { method: "GET", path: `/staff/orders?date=${DAY}` },
    { method: "GET", path: "/staff/orders" },
    { method: "POST", path: `/staff/orders/${UNKNOWN_ID}/ready` },
    { method: "POST", path: "/staff/pickup", body: { code: "ZZZZZZZZ" } },
  ];
  const refused: { auth: string; headers: Record<string, string> }[] = [
    { auth: "no Authorization header", headers: {} },
    { auth: "a wrong bearer token", headers: { Authorization: "Bearer wrong" } },
    {
      auth: "Basic credentials",
      headers: { Authorization: `Basic ${btoa(`staff:${STAFF_TOKEN}`)}` },
    },
    { auth: "the bare token without a scheme", headers: { Authorization: STAFF_TOKEN } },
  ];

  test.each(routes.flatMap((route) => refused.map((auth) => ({ ...route, ...auth }))))(
    "$method $path with $auth",
    async ({ method, path, body, headers }) => {
      const { app } = makeApp();
      const error = expectError(
        await request(app, method, path, { body, headers }),
        401,
        "unauthorized",
      );
      expect(error.message).not.toContain(STAFF_TOKEN);
    },
  );

  test("a refused request changes nothing: a paid order stays paid", async () => {
    const { app, deps } = makeApp();
    const order = await paidOrder(app, deps);
    const wrong = { Authorization: "Bearer wrong" };
    expectError(
      await request(app, "POST", `/staff/orders/${order.id}/ready`, { headers: wrong }),
      401,
      "unauthorized",
    );
    expectError(
      await request(app, "POST", "/staff/pickup", {
        headers: wrong,
        body: { code: pickupCodeOf(1) },
      }),
      401,
      "unauthorized",
    );
    expect((await deps.repo.getOrder(order.id))?.status).toBe("paid");
  });
});

describe("GET /staff/orders", () => {
  test("an empty open day: status open, all 44 grid slots in order, booked 0 of 20, no orders", async () => {
    const { app } = makeApp();
    const board = await getBoard(app);
    expect(board).toEqual({ date: DAY, status: "open", slots: emptySlots(DAY) });
    expect(board.slots).toHaveLength(44);
  });

  test("a held order counts in booked only: 12:30 booked 1, no orders listed", async () => {
    const { app } = makeApp();
    await placeOrder(app);
    const board = await getBoard(app);
    expect(board.slots).toEqual(
      emptySlots(DAY).map((slot) => (slot.label === "12:30" ? { ...slot, booked: 1 } : slot)),
    );
  });

  test("a paid order is listed in its slot as a StaffOrder", async () => {
    const { app, deps } = makeApp();
    const order = await paidOrder(app, deps);
    const slot = byLabel((await getBoard(app)).slots, "12:30");
    expect(slot).toEqual({
      start: S,
      label: "12:30",
      booked: 1,
      capacity: 20,
      orders: [
        {
          id: order.id,
          status: "paid",
          pickupCode: pickupCodeOf(1),
          customerName: "Ada",
          slotStart: S,
          slotLabel: "12:30",
          lines: RECEIPT.lines,
          itemCount: 1,
          totalCents: 1290,
          paidAt: PAID_AT,
        },
      ],
    });
  });

  test("after Ready the order shows ready with readyAt; after pickup picked_up with pickedUpAt", async () => {
    const { app, deps } = makeApp();
    const order = await paidOrder(app, deps);
    deps.clock.set(READY_AT);
    expect((await markReady(app, order.id)).status).toBe(200);
    expect(byLabel((await getBoard(app)).slots, "12:30").orders).toEqual([
      staffOrder(order, 1, { status: "ready", readyAt: READY_AT }),
    ]);

    deps.clock.set(PICKED_UP_AT);
    expect((await pickUp(app, { code: pickupCodeOf(1) })).status).toBe(200);
    expect(byLabel((await getBoard(app)).slots, "12:30").orders).toEqual([
      staffOrder(order, 1, { status: "picked_up", readyAt: READY_AT, pickedUpAt: PICKED_UP_AT }),
    ]);
  });

  test("orders are listed in createdAt order within a slot, whatever order they were paid in", async () => {
    const { app, deps } = makeApp();
    const ada = await placeOrder(app, { customerName: "Ada" });
    deps.clock.set("2026-11-09T11:01:00Z");
    const grace = await placeOrder(app, { customerName: "Grace" });
    deps.clock.set("2026-11-09T11:02:00Z");
    await payOrder(deps, grace.id);
    deps.clock.set("2026-11-09T11:03:00Z");
    await payOrder(deps, ada.id);

    const slot = byLabel((await getBoard(app)).slots, "12:30");
    expect(slot.booked).toBe(2);
    expect(slot.orders.map((order) => order.customerName)).toEqual(["Ada", "Grace"]);
  });

  test("expired and cancelled orders are neither listed nor counted", async () => {
    const { app, deps } = makeApp();
    const expired = await placeOrder(app, { customerName: "Ada" });
    const cancelled = await placeOrder(app, { customerName: "Grace" });
    deps.clock.set("2026-11-09T11:05:00Z");
    await deps.repo.releaseHold(expired.id, "expired", null, deps.now());
    await deps.repo.releaseHold(cancelled.id, "cancelled", "stripe_failed", deps.now());

    expect(byLabel((await getBoard(app)).slots, "12:30")).toEqual({
      start: S,
      label: "12:30",
      booked: 0,
      capacity: 20,
      orders: [],
    });
  });

  test("a closed day: status closed, no slots", async () => {
    const { app } = makeApp();
    expect(await getBoard(app, "?date=2026-11-08")).toEqual({
      date: "2026-11-08",
      status: "closed",
      slots: [],
    });
  });

  test("a past day still shows its grid (§10: every grid slot of the day), with status past", async () => {
    const { app } = makeApp();
    expect(await getBoard(app, "?date=2026-11-06")).toEqual({
      date: "2026-11-06",
      status: "past",
      slots: emptySlots("2026-11-06"),
    });
  });

  test("without a date: today in Berlin, 2026-11-09", async () => {
    const { app } = makeApp();
    expect(await getBoard(app, "")).toEqual({ date: DAY, status: "open", slots: emptySlots(DAY) });
  });

  test("without a date at 2026-11-09T23:30Z: today in Berlin is already 2026-11-10", async () => {
    const { app, deps } = makeApp();
    deps.clock.set("2026-11-09T23:30:00Z");
    expect(await getBoard(app, "")).toEqual({
      date: "2026-11-10",
      status: "open",
      slots: emptySlots("2026-11-10"),
    });
  });

  test("a date that is not YYYY-MM-DD: 400 validation", async () => {
    const { app } = makeApp();
    const res = await request(app, "GET", "/staff/orders?date=bad", { token: STAFF_TOKEN });
    expectError(res, 400, "validation");
  });
});

describe("POST /staff/orders/:id/ready (paid → ready)", () => {
  test("a held order: 409 invalid_transition, and it stays held", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    expectError(await markReady(app, order.id), 409, "invalid_transition");
    expect((await deps.repo.getOrder(order.id))?.status).toBe("held");
  });

  test("a paid order: 200, the StaffOrder with status ready and readyAt = now", async () => {
    const { app, deps } = makeApp();
    const order = await paidOrder(app, deps);
    deps.clock.set(READY_AT);
    const res = await markReady(app, order.id);
    expect(expectJson(res, 200, StaffOrderSchema)).toEqual(
      staffOrder(order, 1, { status: "ready", readyAt: READY_AT }),
    );
  });

  test("an order that is already ready: 409 invalid_transition", async () => {
    const { app, deps } = makeApp();
    const order = await paidOrder(app, deps);
    expect((await markReady(app, order.id)).status).toBe(200);
    expectError(await markReady(app, order.id), 409, "invalid_transition");
  });

  test("an unknown UUID: 404 order_not_found", async () => {
    const { app } = makeApp();
    expectError(await markReady(app, UNKNOWN_ID), 404, "order_not_found");
  });

  test("an id that is not a UUID: 400 validation", async () => {
    const { app } = makeApp();
    expectError(await markReady(app, "not-a-uuid"), 400, "validation");
  });
});

describe("POST /staff/pickup (paid | ready → picked_up; the code normalised first, §8.3)", () => {
  test("a well-formed code no order has: 404 invalid_code", async () => {
    const { app } = makeApp();
    expectError(await pickUp(app, { code: "ZZZZZZZZ" }), 404, "invalid_code");
  });

  test("text that cannot be a code: 404 invalid_code", async () => {
    const { app } = makeApp();
    expectError(await pickUp(app, { code: "abc" }), 404, "invalid_code");
  });

  test.each([
    ["no code", {}],
    ["an empty code", { code: "" }],
    ["a code longer than 20 characters", { code: "A".repeat(21) }],
  ])("%s: 400 validation", async (_case, body) => {
    const { app } = makeApp();
    expectError(await pickUp(app, body), 400, "validation");
  });

  test("a paid order's code typed in lower case with a space and a hyphen: 200 picked_up, pickedUpAt = now", async () => {
    const { app, deps } = makeApp();
    const order = await paidOrder(app, deps);
    const code = pickupCodeOf(1);
    const typed = `${code.slice(0, 4)} ${code.slice(4, 6)}-${code.slice(6)}`.toLowerCase(); // "a1b1 c0-01"
    deps.clock.set(PICKED_UP_AT);
    const res = await pickUp(app, { code: typed });
    expect(expectJson(res, 200, StaffOrderSchema)).toEqual(
      staffOrder(order, 1, { status: "picked_up", pickedUpAt: PICKED_UP_AT }),
    );
  });

  test("I, L and O typed for 1, 1 and 0 still find the order", async () => {
    const { app, deps } = makeApp();
    const order = await paidOrder(app, deps);
    deps.clock.set(PICKED_UP_AT);
    // The order's code, A1B1C001, with its first 1 typed as I, its second as L, and its zeros as O.
    expect(pickupCodeOf(1)).toBe("A1B1C001");
    const res = await pickUp(app, { code: "AIBLCOO1" });
    expect(expectJson(res, 200, StaffOrderSchema)).toMatchObject({
      id: order.id,
      status: "picked_up",
      pickupCode: "A1B1C001",
    });
  });

  test("a ready order: picked_up, keeping readyAt", async () => {
    const { app, deps } = makeApp();
    const order = await paidOrder(app, deps);
    deps.clock.set(READY_AT);
    expect((await markReady(app, order.id)).status).toBe(200);
    deps.clock.set(PICKED_UP_AT);
    const res = await pickUp(app, { code: pickupCodeOf(1) });
    expect(expectJson(res, 200, StaffOrderSchema)).toEqual(
      staffOrder(order, 1, { status: "picked_up", readyAt: READY_AT, pickedUpAt: PICKED_UP_AT }),
    );
  });

  test("an order already picked up: 409 invalid_transition", async () => {
    const { app, deps } = makeApp();
    await paidOrder(app, deps);
    expect((await pickUp(app, { code: pickupCodeOf(1) })).status).toBe(200);
    expectError(await pickUp(app, { code: pickupCodeOf(1) }), 409, "invalid_transition");
  });

  test("a held order's code: 409 invalid_transition, and it stays held", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    expectError(await pickUp(app, { code: pickupCodeOf(1) }), 409, "invalid_transition");
    expect((await deps.repo.getOrder(order.id))?.status).toBe("held");
  });

  test("an expired order's code: 409 invalid_transition", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    await deps.repo.releaseHold(order.id, "expired", null, deps.now());
    expectError(await pickUp(app, { code: pickupCodeOf(1) }), 409, "invalid_transition");
  });
});
