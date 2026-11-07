import { priceCart } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { runCron } from "../../src/app";
import { BURGER, makeApp, placeOrder, S, seedMenu, usageAt } from "../helpers/app";

// docs/design.md §10 (runCron(deps) answers { released, sessionsExpired }), §8.4 (step 1: release the
// expired holds; step 2: payments.expireSession for each released order that has a stripe_session_id,
// best-effort: a refusal is logged and ignored), §8.2 (held → expired), §5 release_expired_holds
// (strictly hold_expires_at < now). Two held one-item orders at 12:30 Berlin through POST /orders: the
// first placed at 11:00Z (hold until 11:10Z, session cs_test_1), the second at 11:02Z (hold until
// 11:12Z, session cs_test_2).

async function twoHolds() {
  const { app, deps } = makeApp();
  const first = await placeOrder(app, { customerName: "Ada" });
  deps.clock.set("2026-11-09T11:02:00Z");
  const second = await placeOrder(app, { customerName: "Grace" });
  expect([first.holdExpiresAt, second.holdExpiresAt]).toEqual([
    "2026-11-09T11:10:00.000Z",
    "2026-11-09T11:12:00.000Z",
  ]);
  expect(await usageAt(deps, S)).toEqual({ booked: 2, capacity: 20 });
  return { deps, first, second };
}

describe("runCron", () => {
  test("at 11:11Z releases the one expired hold and expires its session: { released: 1, sessionsExpired: 1 }", async () => {
    const { deps, first, second } = await twoHolds();
    deps.clock.set("2026-11-09T11:11:00Z");

    expect(await runCron(deps)).toEqual({ released: 1, sessionsExpired: 1 });
    expect(deps.payments.calls.expireSession).toEqual(["cs_test_1"]);
    expect(await deps.repo.getOrder(first.id)).toMatchObject({
      status: "expired",
      expiredAt: new Date("2026-11-09T11:11:00Z"),
      holdExpiresAt: null,
    });
    expect((await deps.repo.getOrder(second.id))?.status).toBe("held");
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });

  test("a second run releases nothing and expires no session: { released: 0, sessionsExpired: 0 }", async () => {
    const { deps, second } = await twoHolds();
    deps.clock.set("2026-11-09T11:11:00Z");
    await runCron(deps);

    expect(await runCron(deps)).toEqual({ released: 0, sessionsExpired: 0 });
    expect(deps.payments.calls.expireSession).toEqual(["cs_test_1"]);
    expect((await deps.repo.getOrder(second.id))?.status).toBe("held");
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });

  test("a hold expiring exactly now is not released yet: at 11:10Z { released: 0, sessionsExpired: 0 }", async () => {
    const { deps, first } = await twoHolds();
    deps.clock.set("2026-11-09T11:10:00Z");

    expect(await runCron(deps)).toEqual({ released: 0, sessionsExpired: 0 });
    expect(deps.payments.calls.expireSession).toEqual([]);
    expect((await deps.repo.getOrder(first.id))?.status).toBe("held");
    expect(await usageAt(deps, S)).toEqual({ booked: 2, capacity: 20 });
  });

  test("once both holds are over (11:13Z) both are released and both sessions expired", async () => {
    const { deps, first, second } = await twoHolds();
    deps.clock.set("2026-11-09T11:13:00Z");

    expect(await runCron(deps)).toEqual({ released: 2, sessionsExpired: 2 });
    expect(deps.payments.calls.expireSession).toEqual(["cs_test_1", "cs_test_2"]);
    expect((await deps.repo.getOrder(first.id))?.status).toBe("expired");
    expect((await deps.repo.getOrder(second.id))?.status).toBe("expired");
    expect(await usageAt(deps, S)).toEqual({ booked: 0, capacity: 20 });
  });

  test("Stripe refusing to expire a session (complete already) is ignored: the hold is released all the same", async () => {
    const { deps, first } = await twoHolds();
    deps.payments.fail("expireSession");
    deps.clock.set("2026-11-09T11:11:00Z");

    expect(await runCron(deps)).toEqual({ released: 1, sessionsExpired: 0 });
    expect(deps.payments.calls.expireSession).toEqual(["cs_test_1"]);
    expect((await deps.repo.getOrder(first.id))?.status).toBe("expired");
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });

  test("a released hold without a session (setCheckout never ran) counts in released, with no expireSession call", async () => {
    const { deps, first } = await twoHolds();
    const receipt = priceCart(seedMenu, BURGER);
    const bare = await deps.repo.placeHold(
      {
        slotStart: new Date(S),
        customerName: "Linus",
        lines: receipt.lines,
        receipt,
        itemCount: receipt.itemCount,
        totalCents: receipt.totalCents,
        promoCode: null,
        pickupCode: "TEST0001",
      },
      20,
      new Date("2026-11-09T11:05:00Z"),
    );
    expect(bare.stripeSessionId).toBeNull();
    deps.clock.set("2026-11-09T11:11:00Z");

    expect(await runCron(deps)).toEqual({ released: 2, sessionsExpired: 1 });
    expect(deps.payments.calls.expireSession).toEqual(["cs_test_1"]);
    expect((await deps.repo.getOrder(bare.id))?.status).toBe("expired");
    expect((await deps.repo.getOrder(first.id))?.status).toBe("expired");
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });
});
