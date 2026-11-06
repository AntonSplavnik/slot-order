import { Hono } from "hono";

// The app is built by a function so tests can pass fakes (docs/design.md §4 Units); nothing to
// inject yet in M0.
export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}
