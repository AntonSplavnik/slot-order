import {
  type Cart,
  type OrderStatus,
  type PricedLine,
  priceCart,
  type Receipt,
} from "@slot-order/core";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { expect } from "vitest";
import { line, seedMenu } from "../../../../packages/core/test/fixtures/menu";
import { localStack } from "./stack";

// Shared pieces of the database suite (docs/design.md §13 Database, docs/handoffs/m3-db-tests.md): the
// connections to the local Supabase stack, the fixtures, and the invariant check. Each test file closes the
// pool with `afterAll(closeDb)`.

const stack = localStack();
const auth = { persistSession: false, autoRefreshToken: false };

/** Postgres as the `postgres` role, directly: assertions, and the 50 parallel callers. */
export const sql = postgres(stack.dbUrl, { max: 50 });

/** PostgREST with the service-role key: how the Worker calls the database (§3 Trust boundary). */
export const service = createClient(stack.apiUrl, stack.serviceRoleKey, { auth });

/** PostgREST with the anon key: what anyone holding the public key could do. */
export const anon = createClient(stack.apiUrl, stack.anonKey, { auth });

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

/** The nine tables of §5, in the order §5 lists them. */
export const TABLES = [
  "settings",
  "menu_items",
  "option_groups",
  "options",
  "combo_components",
  "promo_codes",
  "slots",
  "orders",
  "stripe_events",
] as const;

/** Empties what orders write; the menu tables and `settings` keep the seed. */
export async function resetOrders(): Promise<void> {
  await sql`truncate orders, slots, stripe_events`;
}

// Instants. Monday 2026-11-09 is a seed opening day (11:00–22:00 Berlin, CET = UTC+1).

/** The slot most tests book: 12:30 in Berlin. */
export const SLOT = new Date("2026-11-09T11:30:00Z");
/** The next slot, 12:45 in Berlin, for tests that need a second one. */
export const OTHER_SLOT = new Date("2026-11-09T11:45:00Z");
/** A hold's expiry: placed at 11:00 Berlin, held for the seed's 10 minutes. */
export const HOLD_EXPIRY = new Date("2026-11-09T10:10:00Z");

export function plusMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Rows as the `postgres` driver returns them: timestamptz as Date, jsonb parsed, int as number.

export type SlotRow = { starts_at: Date; capacity: number; booked: number };

export type OrderRow = {
  id: string;
  status: OrderStatus;
  slot_start: Date;
  customer_name: string;
  lines: PricedLine[];
  receipt: Receipt;
  item_count: number;
  total_cents: number;
  promo_code: string | null;
  pickup_code: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  hold_expires_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  paid_at: Date | null;
  ready_at: Date | null;
  picked_up_at: Date | null;
  expired_at: Date | null;
  cancelled_at: Date | null;
};

// Orders. The payload of `place_hold` (§5): snake_case keys, priced with core as the API will price it.

/** Burger Menu + Fries large ×2 with HAHN10: 3 items, the 10 % off spread over both lines. */
export const CART: Cart = {
  lines: [line("burger-menu"), line("fries", { options: ["fries-large"], quantity: 2 })],
  promoCode: "HAHN10",
};

/** `quantity` colas, no promo: a cart of exactly that many items. */
export function colas(quantity: number): Cart {
  return { lines: [line("cola", { quantity })] };
}

export type HoldPayload = {
  slot_start: string;
  customer_name: string;
  lines: PricedLine[];
  receipt: Receipt;
  item_count: number;
  total_cents: number;
  promo_code: string | null;
  pickup_code: string;
};

/** A `p_order` for `place_hold`; `pickupCode` must differ per order (it is unique). */
export function holdPayload(
  pickupCode: string,
  { cart = CART, slotStart = SLOT, customerName = "Mia" }: HoldOptions = {},
): HoldPayload {
  const receipt = priceCart(seedMenu, cart);
  return {
    slot_start: slotStart.toISOString(),
    customer_name: customerName,
    lines: receipt.lines,
    receipt,
    item_count: receipt.itemCount,
    total_cents: receipt.totalCents,
    promo_code: receipt.promoCode ?? null,
    pickup_code: pickupCode,
  };
}

type HoldOptions = { cart?: Cart; slotStart?: Date; customerName?: string };

// The functions of §5 through the `postgres` driver, with every instant explicit.

export async function reserveSlot(startsAt: Date, items: number, capacity: number) {
  const rows = await sql<SlotRow[]>`
    select * from reserve_slot(${startsAt}, ${items}, ${capacity})`;
  return only(rows);
}

export async function placeHold(payload: Partial<HoldPayload>, capacity: number, expiresAt: Date) {
  const rows = await sql<OrderRow[]>`
    select * from place_hold(${sql.json(payload)}, ${capacity}, ${expiresAt})`;
  return only(rows);
}

/** The slot's row, or undefined while it has none (§3 Slot rows). */
export async function slotRow(startsAt: Date): Promise<SlotRow | undefined> {
  const [row] = await sql<SlotRow[]>`select * from slots where starts_at = ${startsAt}`;
  return row;
}

/** The slot's `booked`; 0 while it has no row. */
export async function bookedIn(startsAt: Date): Promise<number> {
  return (await slotRow(startsAt))?.booked ?? 0;
}

export async function orderRow(id: string): Promise<OrderRow | undefined> {
  const [order] = await sql<OrderRow[]>`select * from orders where id = ${id}`;
  return order;
}

/** The pickup codes of every order there is, sorted. */
export async function pickupCodes(): Promise<string[]> {
  const rows = await sql<{ pickup_code: string }[]>`select pickup_code from orders order by 1`;
  return rows.map((row) => row.pickup_code);
}

/** The single row of a result; fails the test unless there is exactly one. */
export function only<T>(rows: readonly T[]): T {
  expect(rows).toHaveLength(1);
  return rows[0] as T;
}

/** Fails the test unless `query` is rejected with SQLSTATE `code`. */
export async function expectSqlState(query: PromiseLike<unknown>, code: string): Promise<void> {
  await expect(query).rejects.toMatchObject({ code });
}

/** §8.2 invariant: every slot's `booked` = Σ `item_count` of its held, paid, ready and picked-up orders. */
export async function expectNoMismatches(): Promise<void> {
  expect([...(await sql`select * from slot_booked_mismatches()`)]).toEqual([]);
}
