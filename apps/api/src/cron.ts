import type { AppDeps } from "./app";

/**
 * The Cron Trigger's body (docs/design.md §10, §8.4): step 1 releases the holds that expired before the
 * clock's now (strictly `<`, §5); step 2 expires the released orders' Checkout Sessions, best-effort: a
 * session that is complete (its `checkout.session.completed` is on its way) or expired already makes
 * Stripe refuse, which is logged and skipped. `sessionsExpired` counts the sessions Stripe accepted.
 */
export async function runCron(
  deps: AppDeps,
): Promise<{ released: number; sessionsExpired: number }> {
  // Step 1.
  const released = await deps.repo.releaseExpiredHolds(deps.now());

  // Step 2, one session at a time: a refusal must not stop the others.
  let sessionsExpired = 0;
  for (const order of released) {
    if (order.stripeSessionId === null) continue;
    try {
      await deps.payments.expireSession(order.stripeSessionId);
      sessionsExpired += 1;
    } catch (error) {
      // The message only (it names the Stripe call), never a request or response body.
      const reason = error instanceof Error ? error.message : "unknown error";
      console.error(
        `cron: session ${order.stripeSessionId} of order ${order.id} not expired: ${reason}`,
      );
    }
  }
  return { released: released.length, sessionsExpired };
}
