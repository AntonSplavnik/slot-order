# M4 brief: implement the API against the tests

You implement the Hono API of `apps/api` so that **every test in `apps/api/test/routes/`, `test/repo/` and
`test/db/repository.test.ts` passes**, with the existing suites still green. The tests were written first, from the
spec; they are the specification. You do not change them.

## Read first
- `docs/design.md` **§10 in full**, §12, §8.2–§8.3, §6.2, §9.2 (so the repository's M5 methods fit), §5 (the SQL
  functions and the PostgREST null-row note), §3 rows "Trust boundary", "Staff", "Pickup code".
- `packages/core/src/schemas/api.ts`, `apps/api/src/repo/types.ts`, `apps/api/src/app.ts`, `apps/api/src/db/rows.ts`.
- Every test under `apps/api/test/` and `apps/api/test/helpers/app.ts`.

## You own
- `apps/api/src/app.ts` (keep the exported names and types), `src/routes/*.ts`, `src/errors.ts` (the `ApiError`
  class and the mapping of §12: `CartError` → 400, `SlotError` codes → 409, `SlotFullError` → 409, `ZodError` → 400
  `validation` with issues, unknown → 500 `internal` with a generic message), `src/auth.ts` (constant-time compare),
  `src/cron.ts`, `src/env.ts` (Zod over the Worker env), `src/index.ts` (builds `AppDeps` with the Supabase
  repository, `new Date()`, `crypto.getRandomValues`; exports `fetch` and `scheduled`), `src/repo/memory.ts`,
  `src/repo/supabase.ts`, and `src/db/rows.ts` (add `orderFromRow` and the `OrderRow` type; keep the existing exports).
- `apps/api/wrangler.toml`: only to add `[vars]` entries the env needs (`WEB_ORIGIN` exists).

## You must not
- Edit tests, fixtures, the core package, configs, `package.json`. Add dependencies (`hono`, `@supabase/supabase-js`,
  `zod`, `postgres` are there; `hono/cors` and `hono/validator` or plain Zod parsing are fine). Commit.
- Read the clock or random numbers anywhere but through `deps.now` and `deps.randomBytes`.
- Let a Supabase key or the staff token appear in any response or log.

## How
- Routes are thin: parse with the core schema → call core (`priceCart`, `listSlots`, `checkSlot`, `holdExpiry`,
  `canTransition`, `normalizePickupCode`, `slotLabel`, `todayIn`, `dayOf`) → call the repository → map to the response
  schema (`OrderSummary`/`StaffOrder` built by one function each, in `src/routes/present.ts`, that drops the fields
  §10.1 says are absent in a status). Validate responses with the core schema in development only if cheap; the tests
  already do.
- `getSlotUsage` for a day: the day's grid from `slotGrid` gives `from` = first start, `to` = last start + 1 ms
  (or the next day's midnight via `dayOf` arithmetic); for one slot, `[S, S + 1 ms)`.
- The memory repository mirrors the SQL of §5 exactly: slot rows created on first reservation with the given capacity,
  `booked + n <= capacity`, conditional transitions, `release_hold` only from `held`, `release_expired_holds` strictly
  `<`, unique pickup codes and stripe event ids. Deep-copy what you return so a caller cannot mutate the store.
- The Supabase repository: `supabase.from(...)`/`.rpc(...)` with the service-role client; map `P0001` + `slot_full` →
  `SlotFullError`, `invalid_status` → `InvalidStatusError`, rethrow the rest with the PostgREST message; a NULL row from
  `release_hold` arrives with `id === null` → `null`; dates via `new Date(...)`; `transition` is one `.update(...)
  .eq("id", id).in("status", from).select()` and `null` when no row comes back.
- Staff auth as Hono middleware on `/staff/*`; CORS with `hono/cors` on `WEB_ORIGIN` and `http://localhost:3000`.
- `runCron` returns `{ released }`; `scheduled()` calls it and logs the count.
- If a test contradicts the spec, do not edit it; implement the spec, let it fail, report it.

## Done means
- `pnpm test` green (core + api), `pnpm test:db` green (78 + the repository contract), `pnpm typecheck`, `pnpm check`.
- `pnpm dev` then `curl localhost:8787/menu` answers the seed menu from the local Supabase stack (needs
  `apps/api/.dev.vars` with the local `SUPABASE_SERVICE_ROLE_KEY` from `supabase status` and a `STAFF_TOKEN`; create
  it from `.dev.vars.example` if missing; it is git-ignored).
- Your report: files, how the memory repository is kept honest, the results, any test you believe is wrong.

## From the test agent's report (read before you start)
- Pickup codes in the route tests come from a byte counter; the first order's code is `A1B1C001`. Build the code with
  core's `pickupCode(deps.randomBytes(8))`.
- `createdAt`: the Supabase repository takes it from the row (`place_hold` uses the database's `now()`); the memory
  repository may use `new Date()` for this one field, the only place a clock is read outside `deps.now`.
- CORS preflights on `/staff/*` pass without the token (browsers send none); mount `cors()` before the auth middleware.
- `empty_cart`, `too_many_lines`, `quantity_out_of_range` never reach `priceCart` through the API: the body schema
  refuses them as `validation`.
- A combo whose component is missing from the menu → 500 `internal` (a menu fault, §7.4).
- The staff board for a past day lists every grid slot with `status "past"`; the cart is priced before the slot is
  checked; a hold expiring exactly at `now` is not released; slot rows keep a `booked: 0` row after release.
- The local stack now runs under the linked project name; `supabase status` and `pnpm test:db` work as before.
