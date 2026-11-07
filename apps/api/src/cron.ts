import type { AppDeps } from "./app";

/**
 * The Cron Trigger's body (docs/design.md §10, §8.4): releases the holds that expired before the clock's
 * now (strictly `<`, §5), then expires the released orders' Checkout Sessions, best-effort (a session
 * that is complete already throws; logged and ignored). Step 2 is not implemented yet (the M5 contract).
 */
export async function runCron(
  deps: AppDeps,
): Promise<{ released: number; sessionsExpired: number }> {
  const released = await deps.repo.releaseExpiredHolds(deps.now());
  return { released: released.length, sessionsExpired: 0 };
}
