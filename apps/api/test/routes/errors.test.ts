import { type ApiErrorCode, ApiErrorSchema } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import { createMemoryRepository } from "../../src/repo/memory";
import type { Repository } from "../../src/repo/types";
import {
  BURGER,
  expectError,
  line,
  makeApp,
  orderBody,
  type RequestOptions,
  request,
  STAFF_TOKEN,
  seedConfig,
  seedMenu,
  UNKNOWN_ID,
} from "../helpers/app";

// docs/design.md §12 (every error is JSON `{ error: { code, message, lineIndex?, issues? } }`; an unknown
// route is `not_found`; anything else is `internal` and never leaks internals), §10.1 ApiError, §7.4 (a
// combo whose component is missing from the menu is the menu's fault: `internal`).

const SECRET = "connection to db.internal:5432 refused, password=hunter2";

/** `repo` with `getMenu` rejecting with `error`; every other method is the repository's own. */
function withFailingGetMenu(repo: Repository, error: Error): Repository {
  return new Proxy(repo, {
    get(target, property) {
      if (property === "getMenu") return () => Promise.reject(error);
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("errors", () => {
  test("an unknown route: 404 { error: { code: not_found, message } } as JSON", async () => {
    const { app } = makeApp();
    const res = await request(app, "GET", "/nope");
    const error = expectError(res, 404, "not_found");
    expect(error.message).toEqual(expect.any(String));
    expect(error.message.length).toBeGreaterThan(0);
  });

  test("a repository that throws: 500 internal, and the message does not leak the error's text", async () => {
    const memory = createMemoryRepository({ settings: seedConfig, menu: seedMenu });
    const { app } = makeApp({ repo: withFailingGetMenu(memory, new Error(SECRET)) });
    const res = await request(app, "GET", "/menu");
    const error = expectError(res, 500, "internal");
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.message).not.toContain(SECRET);
    expect(res.text).not.toContain("hunter2");
    expect(res.text).not.toContain("db.internal");
  });

  test("a combo whose component is missing from the menu: 500 internal (§7.4, the menu's fault)", async () => {
    const menu = { ...seedMenu, items: seedMenu.items.filter((item) => item.id !== "cola") };
    const { app } = makeApp({ repo: createMemoryRepository({ settings: seedConfig, menu }) });
    const res = await request(app, "POST", "/quotes", { body: BURGER });
    expect(expectError(res, 500, "internal").message).not.toContain("cola");
  });

  const STAFF = { token: STAFF_TOKEN };
  test.each<{
    name: string;
    method: string;
    path: string;
    options?: RequestOptions;
    status: number;
    code: ApiErrorCode;
  }>([
    { name: "a bad query", method: "GET", path: "/slots", status: 400, code: "validation" },
    {
      name: "a bad body",
      method: "POST",
      path: "/orders",
      options: { body: orderBody({ customerName: "" }) },
      status: 400,
      code: "validation",
    },
    {
      name: "a cart error",
      method: "POST",
      path: "/quotes",
      options: { body: { lines: [line("nope")] } },
      status: 400,
      code: "unknown_item",
    },
    {
      name: "a slot error",
      method: "POST",
      path: "/orders",
      options: { body: orderBody({ slotStart: "2026-11-08T12:00:00Z" }) },
      status: 409,
      code: "closed_day",
    },
    {
      name: "an unknown order",
      method: "GET",
      path: `/orders/${UNKNOWN_ID}`,
      status: 404,
      code: "order_not_found",
    },
    {
      name: "a missing token",
      method: "GET",
      path: "/staff/orders",
      status: 401,
      code: "unauthorized",
    },
    {
      name: "an unknown pickup code",
      method: "POST",
      path: "/staff/pickup",
      options: { ...STAFF, body: { code: "ZZZZZZZZ" } },
      status: 404,
      code: "invalid_code",
    },
    { name: "an unknown route", method: "POST", path: "/nope", status: 404, code: "not_found" },
  ])(
    "$name: $status $code, application/json, parsed by ApiErrorSchema",
    async ({ method, path, options, status, code }) => {
      const { app } = makeApp();
      const res = await request(app, method, path, options);
      expectError(res, status, code);
      expect(ApiErrorSchema.safeParse(res.json).success).toBe(true);
      expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    },
  );
});
