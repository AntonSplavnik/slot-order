# M3 brief: the database test suite (tests first)

You write the **tests** for the Supabase schema, its SQL functions and the seed (`docs/design.md` §5), run against the
local Supabase stack. Nothing of M3 exists yet: no migrations, no seed, no row mapping. Your tests are the specification
the implementer must satisfy, so they must be precise, readable and **red** when you are done (red here means: the
global setup's `supabase db reset` succeeds on an empty `supabase/migrations/`, and every test that needs a table,
a function or the mapping fails because it is missing).

## Read first
- `docs/design.md` §3 (rows "Slot rows", "No overbooking", "Holds", "Trust boundary"), **§5 in full** (tables, the
  SQL functions with their exact signatures and error messages, the row mapping, the seed with its ids), §8.2
  (the invariant), §13 row "Database".
- The core fixtures the seed must map to: `packages/core/test/fixtures/menu.ts` (`seedMenu`) and
  `packages/core/test/fixtures/slotConfigs.ts` (`seedConfig`). Import them with relative paths from the test files.
- `packages/core/src/schemas/{menu,slots,orders}.ts` (`Menu`, `SlotConfig`, `VAT_RATES_DE_2026`, `ORDER_STATUSES`).
- `apps/api/vitest.db.config.ts` (already written: `globalSetup: ./test/db/setup.ts`, files one at a time, long
  timeouts). `apps/api` has `@supabase/supabase-js`, `postgres` (v4) and `@types/node`.

## Environment
- The local stack is running (`supabase status -o json` prints `DB_URL`, `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`).
  `DB_URL` is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. In CI it is the same stack started by the
  Supabase CLI. Read the keys with `execFileSync("supabase", ["status", "-o", "json"])` once, in `helpers.ts`;
  allow `TEST_DATABASE_URL` and `SUPABASE_URL` env overrides.
- `supabase db reset` (run from the repo root; `cwd` resolved from the test file, not from `process.cwd()`) applies
  every migration and the seed from scratch.

## You own
- `apps/api/test/db/setup.ts` (Vitest `globalSetup`: runs `supabase db reset`, fails loudly with its output if it fails).
- `apps/api/test/db/helpers.ts`: a `postgres` connection with `max: 50`; a service-role and an anon `supabase-js`
  client (`auth: { persistSession: false }`); `resetOrders()` = `TRUNCATE orders, slots, stripe_events` (the menu
  tables stay seeded); fixtures for a slot instant (`2026-11-09T11:30:00Z`), an order payload for `place_hold`
  (matching §5's keys, with a receipt from core's `priceCart(seedMenu, …)` so it is realistic), and
  `expectNoMismatches()` = `select * from slot_booked_mismatches()` is `[]`. Close the pool in an `afterAll` per file.
- `apps/api/test/db/schema.test.ts`, `reserve.test.ts`, `holds.test.ts`, `rls.test.ts`.
- You may import the row mapping from `../../src/db/rows` (`menuFromRows`, `slotConfigFromRow`, the row types) even
  though it does not exist yet: that import is part of the contract (§5 Row mapping) and the implementer creates it.
  Until then `pnpm --filter @slot-order/api typecheck` will fail on that import alone: run it, confirm that is the
  only error, and say so in your report.

## You must not
- Create migrations, the seed, or anything under `src/`. Touch configs, `package.json`, other tests. Commit.
- Depend on the clock: every function that takes `p_now` gets an explicit instant in the tests.

## Facts the tests must pin
Schema (`schema.test.ts`):
- The 9 tables of §5 exist in `public`: `settings`, `menu_items`, `option_groups`, `options`, `combo_components`,
  `promo_codes`, `slots`, `orders`, `stripe_events`. RLS is enabled on each (`pg_class.relrowsecurity`), and no
  policies exist (`pg_policies` empty for them).
- `settings` has one row with `id = 1`; inserting `id = 2` fails (CHECK).
- Seed = fixtures: `menuFromRows({ items, groups, options, components, promoCodes }, VAT_RATES_DE_2026)` from the
  tables (service role, ordered by `sort`) `toEqual(seedMenu)`; `slotConfigFromRow(settingsRow)` `toEqual(seedConfig)`.
- `orders.status` CHECK: an UPDATE to `'bogus'` fails with SQLSTATE `23514`; `slots` CHECK: `booked = capacity + 1`
  and `booked = -1` fail with `23514`; `stripe_events`: the same `id` twice fails with `23505`; `orders.pickup_code`
  twice fails with `23505`; `orders.slot_start` must reference `slots` (`23503`).
- `orders.id` defaults to a UUID; `created_at` defaults to now.

`reserve_slot` (`reserve.test.ts`), slot `2026-11-09T11:30:00Z` unless noted, `resetOrders()` before each:
- First call creates the row: `reserve_slot(S, 3, 20)` → `{ starts_at: S, capacity: 20, booked: 3 }`.
- Sequential: capacity 5, items 3 twice → ok then an error whose message is `slot_full`; `booked` stays 3.
- An existing row keeps its capacity: `reserve_slot(S, 1, 20)` then `reserve_slot(S, 20, 50)` → `slot_full`.
- `p_items` 0 and −1 → `invalid_items`, no row created.
- **50 parallel through `postgres`** (50 connections, `Promise.allSettled` of 50 `select * from reserve_slot(S, 1, 1)`):
  exactly 1 fulfilled, 49 rejected with `slot_full`; `booked = 1`.
- **50 parallel through `supabase-js`** (`supabase.rpc("reserve_slot", { p_starts_at, p_items: 1, p_capacity: 1 })`
  on another slot): exactly 1 with data, 49 with `error.message` containing `slot_full`; `booked = 1`.
- 50 parallel, capacity 20, 1 item each → exactly 20 fulfilled, 30 `slot_full`, `booked = 20`.
- `release_slot(S, 2)` after booking 3 → `booked = 1`; releasing 2 more → fails `23514` (never below 0).
- Through `supabase-js`, errors arrive as `{ message, code }`: pin `code === "P0001"` for `slot_full`.

Holds (`holds.test.ts`), `resetOrders()` before each, `expectNoMismatches()` after each:
- `place_hold(payload, 20, E)` with `E = 2026-11-09T10:10:00Z` → the returned order has `status "held"`,
  `hold_expires_at = E`, the payload's fields stored (`customer_name`, `lines`, `receipt`, `item_count`,
  `total_cents`, `promo_code`, `pickup_code`, `slot_start`), `id` a UUID, `paid_at` null; `slots.booked` = item_count.
- A payload without `customer_name` → an error, and afterwards no order row and `booked` unchanged (rollback).
- A full slot (`reserve_slot(S, 20, 20)` first) → `slot_full`, no order row.
- `release_hold(id, "expired", null, T)` on a held order → `status "expired"`, `expired_at = T`, `hold_expires_at`
  null, `booked` down by its items; a second call → `null` and `booked` unchanged; `release_hold(id, "cancelled",
  "stripe_failed", T)` → `cancelled_at = T`, `cancel_reason "stripe_failed"`; `p_status "paid"` → `invalid_status`;
  an unknown id → `null`.
- `release_expired_holds(T)`: two holds, expiries `T − 1 min` and `T + 1 min` → returns exactly the first (as
  `expired`, `expired_at = T`), the second untouched and still `held`; `booked` down by the first's items only; with
  nothing expired → `[]`. Through `supabase-js` too (`rpc` returns an array).
- `reserve_for_paid(id, 20, "pi_test", T)` on an `expired` order → `status "paid"`, `paid_at = T`,
  `stripe_payment_intent_id "pi_test"`, `booked` up by its items. With the slot filled meanwhile
  (`reserve_slot(S, 20, 20)` after the release) → `slot_full`, the order still `expired`, `booked` unchanged.
  On a `held` order → `invalid_status`.
- The invariant holds after a mixed scenario: three holds, one released, one expired via `release_expired_holds`,
  one re-reserved via `reserve_for_paid`.

RLS (`rls.test.ts`): with the **anon** client, `.from(t).select("*")` for each of the 9 tables answers `data: []`
and no error while the service-role client sees rows (menu tables, settings; and `slots`/`orders` after a
`place_hold`); anon `.insert` into `orders` → error; anon `.rpc("reserve_slot", …)`, `.rpc("place_hold", …)`,
`.rpc("release_expired_holds")` and `.rpc("slot_booked_mismatches")` → an error (`code "42501"` or message containing
`permission denied`); the service-role client can call them.

## Done means
- `pnpm check` passes. `pnpm --filter @slot-order/api typecheck` fails **only** on the missing `../../src/db/rows`.
- `pnpm test:db` runs: the setup resets the (empty) database, and every test fails on a missing table, function or
  module; none passes by accident. Report which fail how.
- Your report: files, tests per file, the typecheck note, and the list of `// SPEC:` points, if any.
