import { PublicMenuSchema } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import {
  DAY,
  expectJson,
  makeApp,
  request,
  STAFF_TOKEN,
  type TestApp,
  type TestResponse,
  WEB_ORIGIN,
} from "../helpers/app";

// docs/design.md §10: CORS allows WEB_ORIGIN and http://localhost:3000 (the web app, §11, in production
// and in `pnpm dev`); no other origin.

const LOCAL_WEB = "http://localhost:3000";
const EVIL = "https://evil.example";

/** A browser's preflight for `method` on `path` from `origin`, optionally announcing request headers. */
async function preflight(
  app: TestApp,
  path: string,
  origin: string,
  method = "GET",
  requestHeaders?: string,
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    Origin: origin,
    "Access-Control-Request-Method": method,
  };
  if (requestHeaders !== undefined) headers["Access-Control-Request-Headers"] = requestHeaders;
  return request(app, "OPTIONS", path, { headers });
}

/** A comma-separated header as lower-case names. */
function names(header: string | null): string[] {
  return (header ?? "").split(",").map((name) => name.trim().toLowerCase());
}

function expectSuccess(res: TestResponse): void {
  expect(res.status).toBeGreaterThanOrEqual(200);
  expect(res.status).toBeLessThan(300);
}

describe("CORS", () => {
  test.each([
    ["WEB_ORIGIN", WEB_ORIGIN],
    ["the local web app", LOCAL_WEB],
  ])(
    "a preflight from %s is allowed: Access-Control-Allow-Origin echoes it",
    async (_name, origin) => {
      const { app } = makeApp();
      const res = await preflight(app, "/menu", origin);
      expectSuccess(res);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    },
  );

  test("a GET /menu from WEB_ORIGIN carries Access-Control-Allow-Origin", async () => {
    const { app } = makeApp();
    const res = await request(app, "GET", "/menu", { headers: { Origin: WEB_ORIGIN } });
    expectJson(res, 200, PublicMenuSchema);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(WEB_ORIGIN);
  });

  test("a foreign origin gets no Access-Control-Allow-Origin, on the preflight or the request", async () => {
    const { app } = makeApp();
    const pre = await preflight(app, "/menu", EVIL);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBeNull();
    // The request itself is answered (the browser is what enforces CORS), just without the header.
    const res = await request(app, "GET", "/menu", { headers: { Origin: EVIL } });
    expectJson(res, 200, PublicMenuSchema);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("Authorization and Content-Type are allowed request headers, and POST an allowed method", async () => {
    const { app } = makeApp();
    const res = await preflight(app, "/orders", WEB_ORIGIN, "POST", "authorization, content-type");
    expectSuccess(res);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(WEB_ORIGIN);
    expect(names(res.headers.get("Access-Control-Allow-Headers"))).toEqual(
      expect.arrayContaining(["authorization", "content-type"]),
    );
    expect(names(res.headers.get("Access-Control-Allow-Methods"))).toEqual(
      expect.arrayContaining(["get", "post"]),
    );
  });

  // SPEC: §10.4 says every /staff/* route without the token answers 401, but a browser never sends
  // Authorization on a preflight; the staff board (§11) calls /staff/* from WEB_ORIGIN, so the preflight
  // must pass before the token is checked. Pinned so.
  test("a preflight for a staff route passes without the token", async () => {
    const { app } = makeApp();
    const res = await preflight(
      app,
      `/staff/orders?date=${DAY}`,
      WEB_ORIGIN,
      "GET",
      "authorization",
    );
    expectSuccess(res);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(WEB_ORIGIN);
    expect(names(res.headers.get("Access-Control-Allow-Headers"))).toContain("authorization");
  });

  test("a staff request from WEB_ORIGIN with the token carries Access-Control-Allow-Origin", async () => {
    const { app } = makeApp();
    const res = await request(app, "GET", `/staff/orders?date=${DAY}`, {
      token: STAFF_TOKEN,
      headers: { Origin: WEB_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(WEB_ORIGIN);
  });
});
