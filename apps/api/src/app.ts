import { Hono } from "hono";
import { cors } from "hono/cors";
import { staffAuth } from "./auth";
import { ApiError, toApiError } from "./errors";
import type { Payments } from "./payments/types";
import type { Repository } from "./repo/types";
import { healthRoutes } from "./routes/health";
import { menuRoutes } from "./routes/menu";
import { orderRoutes } from "./routes/orders";
import { quoteRoutes } from "./routes/quotes";
import { slotRoutes } from "./routes/slots";
import { staffRoutes } from "./routes/staff";
import { webhookRoutes } from "./routes/webhook";

export { runCron } from "./cron";

// The app and its dependencies (docs/design.md §10.3). Routes read the clock only through `now`, random
// bytes only through `randomBytes` and Stripe only through `payments`; src/index.ts builds the real
// ones, the tests their own.
export type AppDeps = {
  repo: Repository;
  now: () => Date;
  staffToken: string;
  webOrigin: string;
  randomBytes: (n: number) => Uint8Array;
  payments: Payments;
};

/** The web app in `pnpm dev` (§11), allowed next to WEB_ORIGIN (§10). */
const LOCAL_WEB_ORIGIN = "http://localhost:3000";

export function createApp(deps: AppDeps) {
  const app = new Hono();

  // CORS first: it answers preflights, which carry no token, before the staff check (§10.4).
  app.use(
    "*",
    cors({
      origin: [deps.webOrigin, LOCAL_WEB_ORIGIN],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.use("/staff/*", staffAuth(deps.staffToken));

  app.route("/", healthRoutes());
  app.route("/", menuRoutes(deps));
  app.route("/", slotRoutes(deps));
  app.route("/", quoteRoutes(deps));
  app.route("/", orderRoutes(deps));
  app.route("/", webhookRoutes(deps));
  app.route("/staff", staffRoutes(deps));

  app.notFound((c) => {
    const error = new ApiError("not_found");
    return c.json(error.toBody(), error.status);
  });

  app.onError((thrown, c) => {
    const error = toApiError(thrown);
    // Logged for operators; the response carries only the generic message (§12).
    if (error.code === "internal") console.error("internal error", thrown);
    return c.json(error.toBody(), error.status);
  });

  return app;
}
