import { HealthSchema } from "@slot-order/core";
import { expect, test } from "vitest";
import { expectJson, makeApp, request } from "../helpers/app";

// docs/design.md §10: GET /health. Moved from test/health.test.ts; built with AppDeps, as every route test
// is, because §10.3 gives `createApp(deps: AppDeps)` a required argument.

test("GET /health answers 200 { ok: true }", async () => {
  const { app } = makeApp();
  const res = await request(app, "GET", "/health");
  expect(expectJson(res, 200, HealthSchema)).toEqual({ ok: true });
});
