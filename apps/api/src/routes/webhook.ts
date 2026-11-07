import { Hono } from "hono";
import type { AppDeps } from "../app";

/** `POST /webhooks/stripe` (docs/design.md §9.2). Not implemented yet (the M5 contract). */
export function webhookRoutes(_deps: AppDeps) {
  return new Hono().post("/webhooks/stripe", () => {
    throw new Error("not implemented");
  });
}
