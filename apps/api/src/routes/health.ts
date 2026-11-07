import { Hono } from "hono";

/** `GET /health` (docs/design.md §10). */
export function healthRoutes() {
  return new Hono().get("/health", (c) => c.json({ ok: true }));
}
