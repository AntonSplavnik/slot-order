import {
  type ApiError,
  type ApiErrorCode,
  ApiErrorSchema,
  type Cart,
  CreateOrderResponseSchema,
  type OrderSummary,
  pickupCode,
  type SlotUsage,
} from "@slot-order/core";
import { expect } from "vitest";
import type { z } from "zod";
import { line, seedMenu } from "../../../../packages/core/test/fixtures/menu";
import { seedConfig } from "../../../../packages/core/test/fixtures/slotConfigs";
import { type AppDeps, createApp } from "../../src/app";
import { createMemoryRepository } from "../../src/repo/memory";

// The route tests' world (docs/design.md §10.3, docs/handoffs/m4-api-tests.md): the app built from
// AppDeps with the in-memory repository on the seed, a clock the test sets, the staff token, the web
// origin, and random bytes from a counter, so pickup codes are known in advance. Nothing reads the real
// clock; nothing touches the network.

export { line, seedConfig, seedMenu };

/** Monday 2026-11-09 12:00 in Berlin (CET, UTC+1): the clock's default. */
export const NOW = "2026-11-09T11:00:00.000Z";
/** The day of NOW in Berlin, a seed opening day (11:00–22:00). */
export const DAY = "2026-11-09";
/** The slot most tests book: 12:30 in Berlin, the earliest bookable slot at NOW (prep 20 minutes). */
export const S = "2026-11-09T11:30:00.000Z";
export const STAFF_TOKEN = "staff-secret";
export const WEB_ORIGIN = "https://web.example";
export const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `iso` moved by `minutes`, as an ISO string. */
export function plusMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

// The clock and the random bytes.

export type Clock = {
  /** The clock's instant (a fresh Date each call). */
  now(): Date;
  /** Moves the clock to `iso`. */
  set(iso: string): void;
};

function makeClock(iso: string): Clock {
  let current = new Date(iso).getTime();
  return {
    now: () => new Date(current),
    set: (next) => {
      current = new Date(next).getTime();
    },
  };
}

/** "A1B1C0": the first six characters of every test pickup code. The bytes are ≥ 32, so only
 * `bytes[i] % 32` into Crockford's alphabet (core's `pickupCode`, §8.3) reads them right. */
const CODE_PREFIX_BYTES = [42, 33, 43, 33, 44, 32];

/** What the `call`-th `randomBytes` call answers (1-based): the prefix, then `call` in two base-32 digits. */
export function bytesOf(call: number): Uint8Array {
  return Uint8Array.of(...CODE_PREFIX_BYTES, Math.floor(call / 32) % 32, call % 32);
}

/** The pickup code made from the `call`-th random bytes: "A1B1C001", "A1B1C002", … */
export function pickupCodeOf(call: number): string {
  return pickupCode(bytesOf(call));
}

/** Deterministic, distinct bytes: each call the next counter value. An order takes one call (§10). */
function counterBytes(): (n: number) => Uint8Array {
  let calls = 0;
  return (n) => {
    calls += 1;
    const bytes = bytesOf(calls);
    if (n !== bytes.length) {
      throw new RangeError(`the test randomBytes answers ${bytes.length} bytes, asked for ${n}`);
    }
    return bytes;
  };
}

// The dependencies and the app.

export type TestDeps = AppDeps & { clock: Clock };

/** AppDeps for a route test: the memory repository on the seed, the clock at NOW, the staff token, the
 * web origin and the counter's bytes; `overrides` replace any of them. */
export function makeDeps(overrides: Partial<AppDeps> = {}): TestDeps {
  const clock = makeClock(NOW);
  return {
    repo: overrides.repo ?? createMemoryRepository({ settings: seedConfig, menu: seedMenu }),
    now: () => clock.now(),
    staffToken: STAFF_TOKEN,
    webOrigin: WEB_ORIGIN,
    randomBytes: counterBytes(),
    ...overrides,
    clock,
  };
}

export type TestApp = ReturnType<typeof createApp>;

/** A fresh app on fresh dependencies: no state is shared between tests. */
export function makeApp(overrides: Partial<AppDeps> = {}): { app: TestApp; deps: TestDeps } {
  const deps = makeDeps(overrides);
  return { app: createApp(deps), deps };
}

// Requests and what they answer.

export type TestResponse = {
  status: number;
  /** The body parsed as JSON; undefined when it is empty or not JSON. */
  json: unknown;
  text: string;
  headers: Headers;
};

export type RequestOptions = {
  /** A string is sent as it is; anything else as JSON. Either way with `Content-Type: application/json`
   * unless `headers` sets one. */
  body?: unknown;
  /** Sent as `Authorization: Bearer <token>`. */
  token?: string;
  headers?: Record<string, string>;
};

type Requestable = {
  request(input: string, init?: RequestInit): Response | Promise<Response>;
};

/** One request through `app.request()` (Hono's in-process fetch). */
export async function request(
  app: Requestable,
  method: string,
  path: string,
  { body, token, headers = {} }: RequestOptions = {},
): Promise<TestResponse> {
  const sent = new Headers(headers);
  if (token !== undefined) sent.set("Authorization", `Bearer ${token}`);
  let payload: string | undefined;
  if (body !== undefined) {
    payload = typeof body === "string" ? body : JSON.stringify(body);
    if (!sent.has("Content-Type")) sent.set("Content-Type", "application/json");
  }
  const res = await app.request(path, { method, headers: sent, body: payload });
  const text = await res.text();
  return { status: res.status, json: parseJson(text), text, headers: res.headers };
}

function parseJson(text: string): unknown {
  try {
    return text === "" ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Fails unless `res` has `status` (the body is shown when it does not); the body parsed by `schema`. */
export function expectJson<T>(res: TestResponse, status: number, schema: z.ZodType<T>): T {
  expect({ status: res.status, body: res.json }).toMatchObject({ status });
  return schema.parse(res.json);
}

/** Fails unless `res` is the error of §12: `status`, JSON, `{ error: { code, message, … } }` as
 * `ApiErrorSchema` parses it. Returns the `error` object for further checks. */
export function expectError(
  res: TestResponse,
  status: number,
  code: ApiErrorCode,
): ApiError["error"] {
  expect({ status: res.status, body: res.json }).toMatchObject({
    status,
    body: { error: { code } },
  });
  expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
  return ApiErrorSchema.parse(res.json).error;
}

// Orders.

/** One Burger Menu: 1 item, 12.90. */
export const BURGER: Cart = { lines: [line("burger-menu")] };

/** `quantity` colas: a cart of exactly that many items. */
export function colas(quantity: number): Cart {
  return { lines: [line("cola", { quantity })] };
}

/** The `POST /orders` body most tests send: one Burger Menu at 12:30 for Ada; `fields` replace or add. */
export function orderBody(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...BURGER, slotStart: S, customerName: "Ada", ...fields };
}

/** `POST /orders` with `orderBody(fields)`, which must answer 201; the order's summary. */
export async function placeOrder(
  app: Requestable,
  fields: Record<string, unknown> = {},
): Promise<OrderSummary> {
  const res = await request(app, "POST", "/orders", { body: orderBody(fields) });
  return expectJson(res, 201, CreateOrderResponseSchema).order;
}

/** What the webhook will do in M5: `held → paid` at the clock's instant, straight on the repository. */
export async function payOrder(deps: AppDeps, id: string): Promise<void> {
  const paid = await deps.repo.transition(id, "held", "paid", deps.now());
  expect(paid?.status).toBe("paid");
}

/** The slot row at `start` (ISO) as the repository has it; undefined while the slot has none. */
export async function usageAt(deps: AppDeps, start: string): Promise<SlotUsage | undefined> {
  const from = new Date(start);
  const usage = await deps.repo.getSlotUsage(from, new Date(from.getTime() + 1));
  return usage.get(from.getTime());
}

/** The entry with `label`; fails the test when there is none. */
export function byLabel<T extends { label: string }>(slots: readonly T[], label: string): T {
  const slot = slots.find((candidate) => candidate.label === label);
  if (slot === undefined) throw new Error(`no slot labelled ${label}`);
  return slot;
}
