import {
  type Booked,
  listSlots,
  OrderSummarySchema,
  type SlotAvailabilityDto,
  SlotsResponseSchema,
  slotGrid,
} from "@slot-order/core";
import { describe, expect, test } from "vitest";
import {
  byLabel,
  colas,
  DAY,
  expectError,
  expectJson,
  makeApp,
  NOW,
  placeOrder,
  request,
  S,
  seedConfig,
  type TestApp,
} from "../helpers/app";

// docs/design.md §10 (GET /slots: releaseExpiredHolds first, then §6.2 listSlots for `items`), §10.1
// SlotsQuery and SlotsResponse, §6.4 (an empty list always says why), §12 validation.
// The seed; now = Mon 2026-11-09 12:00 Berlin (11:00Z) unless a test moves the clock.

/** What §6.2 `listSlots` says for the seed day, as the API sends it (instants as ISO strings). */
function expectedSlots(now: string, booked: Booked = new Map(), items = 1): SlotAvailabilityDto[] {
  return listSlots(seedConfig, DAY, new Date(now), booked, items).map(({ start, ...rest }) => ({
    start: start.toISOString(),
    ...rest,
  }));
}

async function getSlots(app: TestApp, query: string) {
  const res = await request(app, "GET", `/slots${query}`);
  return expectJson(res, 200, SlotsResponseSchema);
}

describe("GET /slots on an open day", () => {
  test("answers 200, status open, the day's 44 slots in grid order with listSlots' availability", async () => {
    const { app } = makeApp();
    const body = await getSlots(app, `?date=${DAY}`);
    expect(body.date).toBe(DAY);
    expect(body.status).toBe("open");
    expect(body.slots).toHaveLength(44);
    expect(body.slots.map((slot) => [slot.start, slot.label])).toEqual(
      slotGrid(seedConfig, DAY).map((slot) => [slot.start.toISOString(), slot.label]),
    );
    expect(body.slots).toEqual(expectedSlots(NOW));
  });

  test("every start is an ISO instant in UTC, ending in Z (§10.1)", async () => {
    const { app } = makeApp();
    const body = await getSlots(app, `?date=${DAY}`);
    for (const slot of body.slots) expect(slot.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*Z$/);
  });

  test("12:30 is bookable with 20 available and carries no reason", async () => {
    const { app } = makeApp();
    const body = await getSlots(app, `?date=${DAY}`);
    const slot = byLabel(body.slots, "12:30");
    expect(slot).toEqual({ start: S, label: "12:30", available: 20, bookable: true });
    expect(slot).not.toHaveProperty("reason");
  });

  test("11:00 and 12:00 are past, 12:15 too_soon (earliest start 12:30 with prep 20)", async () => {
    const { app } = makeApp();
    const body = await getSlots(app, `?date=${DAY}`);
    expect(byLabel(body.slots, "11:00")).toMatchObject({ bookable: false, reason: "past" });
    expect(byLabel(body.slots, "12:00")).toMatchObject({ bookable: false, reason: "past" });
    expect(byLabel(body.slots, "12:15")).toMatchObject({
      available: 20,
      bookable: false,
      reason: "too_soon",
    });
  });
});

describe("GET /slots on a day that cannot be booked (§6.4: the status says why the list is empty)", () => {
  test.each([
    ["2026-11-08", "closed", "Sunday, closed in the seed"],
    ["2026-11-16", "too_far", "day 8 of a 7-day horizon"],
    ["2026-11-06", "past", "the Friday before today"],
  ])("%s answers status %s and no slots (%s)", async (date, status) => {
    const { app } = makeApp();
    const body = await getSlots(app, `?date=${date}`);
    expect(body).toEqual({ date, status, slots: [] });
  });
});

describe("GET /slots with items", () => {
  test("after a hold of 18 items at 12:30, items=3 finds it full with 2 available", async () => {
    const { app } = makeApp();
    await placeOrder(app, colas(18));
    const body = await getSlots(app, `?date=${DAY}&items=3`);
    expect(byLabel(body.slots, "12:30")).toEqual({
      start: S,
      label: "12:30",
      available: 2,
      bookable: false,
      reason: "full",
    });
  });

  test("after the same hold, items=2 still finds 12:30 bookable", async () => {
    const { app } = makeApp();
    await placeOrder(app, colas(18));
    const body = await getSlots(app, `?date=${DAY}&items=2`);
    expect(byLabel(body.slots, "12:30")).toEqual({
      start: S,
      label: "12:30",
      available: 2,
      bookable: true,
    });
  });

  test("items defaults to 1", async () => {
    const { app } = makeApp();
    await placeOrder(app, colas(19));
    const body = await getSlots(app, `?date=${DAY}`);
    expect(byLabel(body.slots, "12:30")).toMatchObject({ available: 1, bookable: true });
  });
});

describe("GET /slots refuses a bad query with 400 validation and Zod's issues", () => {
  test.each([
    ["no date", ""],
    ["a date that is not YYYY-MM-DD", "?date=2026-1-9"],
    ["items below 1", `?date=${DAY}&items=0`],
    ["items above 100", `?date=${DAY}&items=101`],
  ])("%s", async (_case, query) => {
    const { app } = makeApp();
    const error = expectError(await request(app, "GET", `/slots${query}`), 400, "validation");
    expect(error.issues?.length).toBeGreaterThan(0);
  });
});

describe("GET /slots releases expired holds before it lists (§10)", () => {
  test("a hold that expired at 11:10 is expired after a listing at 11:11, and 12:30 shows 20 again", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    expect(order.holdExpiresAt).toBe("2026-11-09T11:10:00.000Z");
    deps.clock.set("2026-11-09T11:11:00Z");

    const body = await getSlots(app, `?date=${DAY}`);
    // At 12:11 Berlin the earliest start is 12:45, so 12:30 is too_soon now; what matters is the count.
    expect(byLabel(body.slots, "12:30")).toMatchObject({ available: 20 });
    expect((await deps.repo.getOrder(order.id))?.status).toBe("expired");
    const summary = await request(app, "GET", `/orders/${order.id}`);
    expect(expectJson(summary, 200, OrderSummarySchema).status).toBe("expired");
  });

  test("a hold expiring exactly now still counts (§5: released only when hold_expires_at < now)", async () => {
    const { app, deps } = makeApp();
    const order = await placeOrder(app);
    deps.clock.set("2026-11-09T11:10:00Z");

    const body = await getSlots(app, `?date=${DAY}`);
    expect(byLabel(body.slots, "12:30")).toEqual({
      start: S,
      label: "12:30",
      available: 19,
      bookable: true,
    });
    expect((await deps.repo.getOrder(order.id))?.status).toBe("held");
  });
});
