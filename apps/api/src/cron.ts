import type { AppDeps } from "./app";

/**
 * The Cron Trigger's body (docs/design.md §10, §8.4 step 1): releases the holds that expired before the
 * clock's now (strictly `<`, §5) and counts them. Step 2, expiring their Stripe sessions, arrives in M5.
 */
export async function runCron(deps: AppDeps): Promise<{ released: number }> {
  const released = await deps.repo.releaseExpiredHolds(deps.now());
  return { released: released.length };
}
