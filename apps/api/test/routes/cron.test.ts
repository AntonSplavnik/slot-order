import { describe, expect, test } from "vitest";
import { runCron } from "../../src/app";
import { makeApp, placeOrder, S, usageAt } from "../helpers/app";

// docs/design.md §10 (runCron(deps): release the expired holds, return { released }), §8.4 step 1 (step 2,
// expiring the Stripe sessions, arrives in M5), §5 release_expired_holds (strictly hold_expires_at < now).
// Two held one-item orders at 12:30 Berlin: the first placed at 11:00Z (hold until 11:10Z), the second at
// 11:02Z (hold until 11:12Z).

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
  test("at 11:11Z releases the one expired hold: { released: 1 }, and the slot gets its item back", async () => {
    const { deps, first, second } = await twoHolds();
    deps.clock.set("2026-11-09T11:11:00Z");

    expect(await runCron(deps)).toEqual({ released: 1 });
    expect(await deps.repo.getOrder(first.id)).toMatchObject({
      status: "expired",
      expiredAt: new Date("2026-11-09T11:11:00Z"),
      holdExpiresAt: null,
    });
    expect((await deps.repo.getOrder(second.id))?.status).toBe("held");
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });

  test("a second run releases nothing: { released: 0 }", async () => {
    const { deps, second } = await twoHolds();
    deps.clock.set("2026-11-09T11:11:00Z");
    await runCron(deps);

    expect(await runCron(deps)).toEqual({ released: 0 });
    expect((await deps.repo.getOrder(second.id))?.status).toBe("held");
    expect(await usageAt(deps, S)).toEqual({ booked: 1, capacity: 20 });
  });

  test("a hold expiring exactly now is not released yet: at 11:10Z { released: 0 }", async () => {
    const { deps, first } = await twoHolds();
    deps.clock.set("2026-11-09T11:10:00Z");

    expect(await runCron(deps)).toEqual({ released: 0 });
    expect((await deps.repo.getOrder(first.id))?.status).toBe("held");
    expect(await usageAt(deps, S)).toEqual({ booked: 2, capacity: 20 });
  });

  test("once both holds are over (11:13Z) both are released", async () => {
    const { deps, first, second } = await twoHolds();
    deps.clock.set("2026-11-09T11:13:00Z");

    expect(await runCron(deps)).toEqual({ released: 2 });
    expect((await deps.repo.getOrder(first.id))?.status).toBe("expired");
    expect((await deps.repo.getOrder(second.id))?.status).toBe("expired");
    expect(await usageAt(deps, S)).toEqual({ booked: 0, capacity: 20 });
  });
});
