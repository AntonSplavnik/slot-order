import { Hono } from "hono";
import type { Repository } from "./repo/types";

// The app and its dependencies (docs/design.md §10.3). M4 is built test-first: the routes replace the
// stub below against apps/api/test/routes/.
export type AppDeps = {
  repo: Repository;
  now: () => Date;
  staffToken: string;
  webOrigin: string;
  randomBytes: (n: number) => Uint8Array;
};

export function createApp(_deps?: AppDeps) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}

/** The Cron Trigger's body (§10): releases expired holds. Stub until M4. */
export async function runCron(_deps: AppDeps): Promise<{ released: number }> {
  throw new Error("not implemented: runCron");
}
