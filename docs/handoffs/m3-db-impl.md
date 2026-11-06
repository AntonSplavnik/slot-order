# M3 brief: implement the schema, functions, seed and row mapping against the tests

You implement M3 so that **every test in `apps/api/test/db/` passes** (`pnpm test:db`, against the running local
Supabase stack). The tests were written first, from the spec; they are the specification. You do not change them.

## Read first
- `docs/design.md` §3 (rows "Slot rows", "No overbooking", "Holds", "Trust boundary"), **§5 in full**, §8.2, §13 row
  "Database", §14 "Deploys" (what `supabase db push` will apply).
- Every file in `apps/api/test/db/`, and the core fixtures `packages/core/test/fixtures/menu.ts` (`seedMenu`) and
  `packages/core/test/fixtures/slotConfigs.ts` (`seedConfig`): **the seed is written from them**, ids, names,
  descriptions, prices, sort values, groups, options, components, promo codes, settings, exactly.

## You own
- `supabase/migrations/20261106120000_schema.sql`: the 9 tables of §5 with their CHECKs, foreign keys, unique
  constraints, indexes and defaults; `ENABLE ROW LEVEL SECURITY` on each, no policies.
- `supabase/migrations/20261106120100_functions.sql`: the functions of §5 with exactly those names, parameters,
  defaults, return types and `RAISE EXCEPTION` messages (`invalid_items`, `slot_full`, `invalid_status`); the
  `REVOKE EXECUTE` from `public`, `anon`, `authenticated` on each; comments naming the § they implement.
- `supabase/seed.sql`: settings (§5), the menu, promo codes.
- `apps/api/src/db/rows.ts`: the row types (snake_case, as the tables) and the pure `menuFromRows(rows, vatRates)` and
  `slotConfigFromRow(row)` of §5 Row mapping; no I/O in this file. Validate the result with the core schemas
  (`MenuSchema.parse`, `SlotConfigSchema.parse`) so a bad seed fails loudly.

## You must not
- Edit tests, fixtures, configs, `package.json`, or files outside those named. Add dependencies. Commit or push.
- Use `SECURITY DEFINER`. Use triggers where a function or a CHECK does the job.

## How
- Iterate with `supabase db reset` (applies migrations + seed from scratch; read its errors) and `pnpm test:db`.
  `psql` is not installed; use `supabase db reset` and the tests, or a short `node` script with `postgres`, to inspect.
- `reserve_slot`: `INSERT … ON CONFLICT DO NOTHING`, then the single conditional `UPDATE … RETURNING`; `IF NOT FOUND
  THEN RAISE EXCEPTION 'slot_full'`. No explicit locks beyond what the `UPDATE` takes.
- `place_hold` reads the payload with `->>` and casts; let a bad payload fail the `INSERT` (NOT NULL / CHECK), which
  rolls the reservation back because the whole RPC is one transaction.
- `release_expired_holds` loops `FOR r IN SELECT … FOR UPDATE SKIP LOCKED` (or a plain loop; say which and why) and
  `RETURN NEXT release_hold(...)` for each.
- Keep the SQL readable: one statement per idea, comments with the § numbers.

## Done means
- `pnpm test:db` green; `pnpm test`, `pnpm typecheck` (now including `src/db/rows.ts` and the tests), `pnpm check`
  green.
- Your report: files, how `reserve_slot` serialises concurrent callers (one paragraph), anything in a test you believe
  contradicts the spec (do not bend the code; report it).

## From the test agent's report (read before you start)
- `promo_codes` has a `sort` column now (spec §5); the seed orders HAHN10, WELCOME3, OLD as the fixture does; the
  mapping orders promo codes by `sort` (the test compares them sorted by code, so either order passes, but keep it).
- The tests pin, beyond the brief: every `ORDER_STATUSES` value passes the `orders.status` CHECK;
  `orders.stripe_session_id` is unique; a hold expiring exactly at `p_now` is **not** released (`<`, not `<=`);
  anon is refused on all 7 functions and each refused call changes nothing.
- The 50-connection races hold 50 distinct backends before racing; `reserve_slot` must not take any lock that
  serialises more than the one slot row.
- The tests' own row types live in `test/db/helpers.ts`; your `src/db/rows.ts` defines the exported row types the
  API will use (snake_case, matching the columns).
