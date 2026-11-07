# Plan

Build `docs/design.md` (a bare § means a section of that file) in seven small milestones, M0–M6, one at a time,
test-first, each ending with a demo, passing checks, a pull request and a stop for review. M7 (POS adapter) is listed
but not planned; it happens only if time is left after M6.

## Context

Decisions taken on 2026-11-06, before this plan:
- Fictional restaurant **Goldhahn**; repo `slot-order`, public on github.com/AntonSplavnik.
- **Weekend version:** M0–M6. Target: everything reviewed and live by **Mon 2026-11-10**, a buffer before the
  follow-up around 2026-11-12. If time runs short, cut UI (M6), never tests.
- Slot capacity counted in **items**. UI in **English**. Web app on **Cloudflare** via OpenNext (Vercel as fallback).
- **Promo code in scope** (part of M2); **POS mock out** (M7, only if time is left).
- Git author stays as the global config (`LazyPixel`).

Verified environment (2026-11-06):
- Node 26.8.2, pnpm 11.18.0, Docker 29.8.2 (installed, daemon not running at the time), git 2.39, `gh` 2.103 logged in
  as AntonSplavnik.
- **Not installed:** Supabase CLI, Stripe CLI, wrangler (will be a devDependency), Biome (a devDependency).
- No Cloudflare, Supabase or Stripe account checked yet. M0 confirms the accounts exist (free tiers) and `wrangler login`
  works; M3 creates the Supabase project, M5 the Stripe test keys.

Rough timetable: Fri 2026-11-07 M0–M2 · Sat 2026-11-08 M3–M4 · Sun 2026-11-09 M5–M6 · Mon 2026-11-10 README, message,
production check, CV.

## Milestones

| # | Milestone | Risk it removes | Demo |
|---|---|---|---|
| M0 | Repo setup: pnpm, TS, Biome, Vitest, Hono skeleton, Supabase init, CI | Tooling in a new stack; CI with local Supabase | CI green on the smoke tests; `curl localhost:8787/health` |
| M1 | Core: slot rules + tests (incl. DST) | The logic named in the job ad | `pnpm test` with the slot suite, DST cases green |
| M2 | Core: pricing + VAT + promo + order transitions + tests | Money and rounding errors | The §7.4 receipt printed by a test |
| M3 | Supabase schema, functions, seed + `test:db` | Overbooking under concurrency | 50 parallel → 1 winner, in CI too |
| M4 | Hono API on Workers (menu, slots, quotes, orders, staff) + deploy | The new stack end to end | curl against the deployed Worker |
| M5 | Stripe Checkout (test) + idempotent webhook + cron | Payments and the hold race | Test card → `paid`, pickup code; the same event twice → one order |
| M6 | Next.js + Tailwind flow and staff board + QR check-in + deploy | UI and the OpenNext deploy | Phone: order → pay → QR; second phone: scan → picked up |
| M7 | POS adapter interface + mock (not planned) | Integration thinking | Paid order appears in the mock POS log |

### M0: Repo setup
- **Install:** `brew install supabase/tap/supabase stripe/stripe-cli/stripe`; start Docker. `gh repo create
  AntonSplavnik/slot-order --public` (after the first commit; the handoff is git-ignored first).
- **Root:** `package.json` (`engines >=24`, `packageManager pnpm@11.18.0`, scripts `dev`, `test`, `test:db`,
  `typecheck`, `check`, `format`), `pnpm-workspace.yaml` (`packages/*`, `apps/*`; a catalog for typescript, zod,
  vitest), `tsconfig.base.json` (strict, Bundler, `noUncheckedIndexedAccess`), `biome.json` (Dingsda's), `.gitignore`
  (`node_modules`, `.env*` except `.env.example`, `.dev.vars`, `.wrangler`, `.open-next`, `.next`, `supabase/.temp`,
  `.DS_Store`, **`HANDOFF.md`, `MESSAGE.md`**), `.editorconfig`.
- **`packages/core`:** `src/index.ts`, `tsconfig` with `types: []`, one smoke test.
- **`apps/api`:** Hono app with `GET /health`, `wrangler.toml` (name `slot-order-api`, `compatibility_date` of today,
  cron `* * * * *` with an empty `scheduled`), `.dev.vars.example`, a route test with `app.request()`.
- **`supabase/`:** `supabase init` (config.toml; local ports as generated), an empty `migrations/`, `seed.sql` with a
  comment. Decide `pnpm test:db`'s CI shape: try `supabase db start` on the runner; fall back to the `postgres:17`
  service (§14) and record the result in §14.
- **CI:** `.github/workflows/ci.yml` with the checks job only (deploy jobs come in M4 and M6); `paths-ignore` for
  Markdown.
- **Docs:** `CLAUDE.md` (written in this session), `README.md` skeleton with every section of §Deliverables in the brief
  and an empty **"What the agent got wrong and what I changed"** list, `docs/handoffs/README.md` explaining the
  handoff files.
- **Demo:** CI green; `pnpm dev` and `curl localhost:8787/health` → `{"ok":true}`.
- **Verify in M0:** `wrangler login` works and the Cloudflare account has Workers enabled; a Supabase account exists;
  a Stripe account exists with test mode.

### M1: Core slots
- **Tests first** (`packages/core/test/slots/*.test.ts`), every case of §13 Slots: grid per weekday from the seed config,
  two ranges on one day, "24:00", 44/92/100 slots on 2026-03-29, 2026-10-25 and a normal day, labels, the non-existent
  and ambiguous opening times, earliest start (on a grid point, mid-slot, across the DST gap), cut-off with prep 0,
  horizon at 23:30 / 00:30 Berlin with the process in UTC (`TZ=UTC` in the Vitest config), `dayStatus`, `listSlots`
  reasons, `checkSlot` order of errors, `holdExpiry`.
- **Then implement** `src/slots/{config,grid,availability,check}.ts` and the `SlotConfig`, `Slot`, `SlotAvailability`,
  `SlotError` schemas in `src/schemas/`.
- **Research first:** how `@date-fns/tz` resolves non-existent and ambiguous wall times; write the result into §6.3 before
  the tests are written.
- **Demo:** `pnpm test` shows the slot suite green, with the DST tests named so they read well in the output.

### M2: Core pricing and orders
- **Tests first:** every `CartError`, deltas, group min/max, the worked example of §7.4 byte for byte, the VAT rounding
  table, percent and fixed promos, the largest-remainder spread cases, promo above the subtotal, combo parts, the
  property test (seeded random carts: VAT summary sums to the total; discount shares sum to the discount; parts sum to
  the line), `canTransition` over the whole table, pickup codes.
- **Then implement** `src/pricing/{validate,allocate,vat,price}.ts`, `src/orders/{transitions,pickupCode}.ts`. The
  `Menu`, `Cart`, `Receipt`, `PricedLine`, `OrderStatus` schemas are the contract, written before the tests;
  `OrderSummary` and `StaffOrder` are M4's, where they are used.
- **Fixture:** `packages/core/test/fixtures/menu.ts` is the Goldhahn menu as `core` sees it; M3's `seed.sql` is written
  from it, and a `test:db` test compares the two (so the seed and the fixture cannot drift).
- **Demo:** the two worked receipts of §7.4 pinned to the cent by tests that read as sentences in `pnpm test`'s
  verbose output (changed from "a test prints the receipt": a printing test proves nothing; the pinned one does).

### M3: Supabase schema, functions, seed
- **Tests first** (`apps/api/test/db/`, own Vitest config, `globalSetup` runs `supabase db reset`): migrations apply;
  the seed equals the `core` fixture; `reserve_slot` 50 parallel with capacity 1 → 1 ok, 49 `slot_full`, `booked = 1`;
  `place_hold` atomic (a bad order payload leaves `booked` unchanged); `release_hold` twice; `release_expired_holds(p_now)`;
  `reserve_for_paid` ok and full; the invariant of §8.2; RLS blocks anon on every table and every function.
- **Then write** `supabase/migrations/0001_schema.sql`, `0002_functions.sql`, `seed.sql`.
- **CI:** the `test:db` job, in whatever shape M0 settled.
- **Cloud:** create the Supabase project (Frankfurt), `supabase link`, `supabase db push` by hand this once; from M4 CI
  pushes. Keys into `.dev.vars` only.
- **Demo:** `pnpm test:db` with the 50-parallel test green locally and in CI.

### M4: Hono API on Workers
- **Tests first** (`apps/api/test/routes/`): every route of §10 against the in-memory repository (orders are held without
  Stripe in this milestone: `checkoutUrl: null`, and the hold expiry still applies), every error of §12 except the
  Stripe ones, staff auth, `GET /slots` releasing expired holds, server-side pricing, `pickupCode` hidden while held,
  CORS.
- **Then implement** `src/app.ts` (`createApp(env, deps)`), `src/repo/{types,supabase,memory}.ts`, `src/routes/*.ts`,
  `src/errors.ts`, `src/clock.ts`; `scheduled()` calls `release_expired_holds` (the Stripe part comes in M5).
- **Deploy:** `wrangler deploy` by hand once, then the CI deploy job (`supabase db push`, `wrangler deploy` on `main`).
  Secrets with `wrangler secret put`.
- **Demo:** `curl` against `https://slot-order-api.<account>.workers.dev`: `/menu`, `/slots?date=…` (an open day, a
  Sunday, a day too far), `/quotes` with the §7.4 cart, `/orders` → held order, `/orders/:id`, `/staff/orders` with the
  token.

### M5: Stripe
- **Research first** (the orchestrator, before the contract): the `stripe` package on Workers: whether the fetch
  HTTP client is the default or needs `Stripe.createFetchHttpClient()`, `Stripe.createSubtleCryptoProvider()` for
  `webhooks.constructEventAsync`, whether `nodejs_compat` is needed; Checkout Session `expires_at` minimum (30 min,
  §17); `checkout.sessions.expire` and `refunds.create` signatures; `stripe.webhooks.generateTestHeaderString` for
  tests. Record in §17 and §14.
- **Contract** (spec first, then code): §9 refined into `Payments` in `apps/api/src/payments/types.ts`:
  `createCheckout(order, receipt, urls: { success, cancel }, now): Promise<{ sessionId, url }>`,
  `expireSession(sessionId)`, `refund(paymentIntentId)`, `verifyWebhook(rawBody, signature): Promise<StripeEvent>`
  (a small typed subset: id, type, `data.object.{id, payment_status, payment_intent, metadata.order_id}`);
  `createStripePayments(stripe, webhookSecret)` and `createFakePayments()` (records calls, can be told to fail, can
  mint signed test events); migration `supabase/migrations/20261107120000_checkout_url.sql` adding
  `orders.checkout_url text` (and `Order.checkoutUrl`, `setCheckout` storing it, `OrderSummary.checkoutUrl` while
  held, `rows.ts`); `AppDeps.payments` required; `Env` with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Tests first** (`apps/api/test/routes/webhook.test.ts`, `orders.test.ts` additions, `cron.test.ts` additions,
  `test/payments/fake.test.ts`, contract additions for `setCheckout`'s URL): Checkout Session creation on
  `POST /orders` (one line item per priced line with `quantity 1` and the discounted gross, `expires_at` = now + 30
  min, `metadata.order_id`, `client_reference_id`, the URLs from `WEB_ORIGIN`; `checkoutUrl` in the 201 body and in
  `GET /orders/:id` while held), Stripe failure → `release_hold(cancelled, stripe_failed)` + 502
  `payment_unavailable`; the webhook: signature with `generateTestHeaderString` and a test secret, a bad signature →
  400 `bad_signature`, `checkout.session.completed` (paid) → `held → paid` with the payment intent, the same event
  twice → one paid order and one `stripe_events` row and `{ duplicate: true }`, `checkout.session.expired` → cancelled
  only when held, an unknown order → 200, an unhandled type → 200 and recorded, a processing failure → the event row
  removed and 500, the expired-then-paid race (`reserve_for_paid` ok → paid; `slot_full` → refund + cancelled
  `refunded_slot_full`); the cron: release, then `expireSession` per released order, an error from Stripe (session
  already complete) logged and ignored, the count returned.
- **Then implement** `src/payments/{types,stripe,fake}.ts`, `src/routes/webhook.ts` (raw body, no JSON parsing before
  verification), the order route's Stripe step, the cron's step 2, the migration, `rows.ts`.
- **Stripe setup** (Anton): a Stripe account in test mode; `STRIPE_SECRET_KEY` (`sk_test_…`) and, from Developers →
  Webhooks → add endpoint `https://slot-order-api.antonsplavnik.workers.dev/webhooks/stripe` with the events
  `checkout.session.completed` and `checkout.session.expired`, its signing secret `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
  Into `.env` (git-ignored) and `wrangler secret put` ×2; locally `apps/api/.dev.vars` and `stripe listen
  --forward-to localhost:8787/webhooks/stripe` (its own `whsec_` for local).
- **Demo:** `POST /orders` on the live Worker → open `checkoutUrl` → test card `4242 4242 4242 4242` →
  `GET /orders/:id` is `paid` with a pickup code; the event replayed from the Stripe dashboard answers
  `{ duplicate: true }` and the order stays paid once; the cron expires an unpaid hold's session.

### M6: Web
- **Tests first** (small; the UI is thin): the cart reducer (add, change options, quantity, remove, persisted), the slot
  chip state from `SlotAvailability`, the status page's text per status, the API client validating responses with the
  `core` schemas, the QR payload.
- **Then implement** the screens of §11 with Tailwind; `next.config` with `transpilePackages`; `@opennextjs/cloudflare`
  with `wrangler.toml` (`slot-order-web`, `nodejs_compat`); the CI deploy job for the web. If OpenNext blocks for more
  than an hour, deploy to Vercel and update §3, §14.
- **Demo:** on the phone: menu → options → checkout → slot → Stripe test card → QR code; on a second phone: scan the QR →
  "Picked up ✓"; the staff board shows the order moving through the slot. Also the error paths: a Sunday, a full slot
  (seed a slot to capacity − 1 and order 2 items), an expired hold.

### After M6 (Mon 2026-11-10)
- README final: what it is, a 30-second architecture overview, how to run it, test commands, **"What the agent got wrong
  and what I changed"** with commit links, links to the docs, the CI badge, the live URLs.
- `MESSAGE.md` (repo root, git-ignored like `HANDOFF.md`): the short note to send with the repo (pitch: "I wanted to try your stack on the kind of problem you
  work on"; never "this fixes your problem"). Anton sends it.
- Production check: the whole phone flow against the live URLs; a webhook event replayed from the Stripe dashboard.
- CV: add the project to `~/Documents/Job/pipeline/profile.yaml` (`url` = the live web app, `code` = the repo) and
  re-render. Outside this repo.

### M7: POS adapter (only if time is left, not planned)
`PosAdapter` interface in `core`, a mock in `api` writing to `pos_log`, called after `paid`; a "POS" column on the staff
board. Spec in §16 before any code.

## How the work is done

- **Spec first.** §-sections exist before code. Any deviation found while building goes into `docs/design.md` in the
  same commit, and into "Spec changes to record" below until it is written back.
- **Test first.** The orchestrator writes (or has a subagent write) the milestone's tests, Anton reviews them, then the
  implementation is built against them.
- **Multi-agent execution.** The main session is the orchestrator: it briefs subagents with a handoff file in
  `docs/handoffs/` (goal, files, tests to make pass, what not to touch, the §-sections to read), runs them in parallel
  where the work is independent (e.g. `slots/` and `pricing/`), runs `pnpm test`, `typecheck` and `check` when they
  report back, reads every diff, and writes the spec back. Subagents never commit, push, or touch secrets or CI.
- **Context.** When the orchestrator's context passes ~28 %, it writes `docs/handoffs/next-session.md` (state, what is
  green, what is open, the next step) and the next session starts fresh from it. The Status table below is updated at
  every step change and after every approval, with a "Next action" line, so any context can resume from it.
- **Review gate.** A milestone ends when tests, typecheck and lint pass and the demo works. The orchestrator commits on a
  branch `m<N>-<name>`, pushes it so CI runs, opens a PR, and **stops**. Anton reviews and runs it; what he changes or
  asks to change is an entry for the README's "What the agent got wrong" (with the commit). He merges; `main` deploys.
  (The brief says "only reviewed work is pushed"; a reviewed PR branch is the way this plan reads it, so CI and the
  review happen in the open. Anton can change this to "push after review" in CLAUDE.md.)
- **Migrations** are tested with `supabase db reset` locally before they reach a PR; `supabase db push` runs only from CI
  on `main` (and once by hand in M3).

## Status

Updated at **every step change** and after each of Anton's approvals, so a fresh context can pick up here
(Anton's rule, 2026-11-06). Steps of a milestone: `not started` → `contract written` (§-sections, schemas, stubs,
briefs) → `tests written (red)` → `implementation green` → `demo ok, PR open` → `approved` → `merged`.
`docs/handoffs/next-session.md` names the exact next action whenever a session may end mid-milestone.

**Next action:** M5 (Stripe) on a new branch `m5-stripe`, following `docs/handoffs/next-session.md` step by step:
contract first (§9 refined into the `Payments` interface, the `checkout_url` migration, the webhook and cron
behaviour), then the test brief and the test agent, red commit, implementer, green, Stripe setup with Anton's test
keys, the demo, PR, stop.

| Milestone | Step | PR | Notes |
|---|---|---|---|
| Spec, plan, CLAUDE.md | approved 2026-11-06 | — | |
| M0 | **merged** 2026-11-06 | #1 | CI: checks 28 s, Supabase stack 1 min 35 s on the runner; demo verified by Anton |
| M1 | **merged** 2026-11-06 | #2 | 145 tests green under `TZ=UTC` and `TZ=Europe/Berlin`; host-independent `wallToInstant`; spec §6 corrected in 5 places found by the agents |
| M2 | **merged** 2026-11-06 | #3 | 373 tests green under both timezones; integer-only money; the agents caught the brief's wings-menu arithmetic and 7 silent points in §7, now written |
| M3 | **merged** 2026-11-07 | #4 | 78 db tests green twice back to back; CI database job added; cloud project `ckvngajrwdijdtjvfblm` created and linked 2026-11-07, migrations and seed pushed, RLS verified against the cloud; GitHub secrets `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` set; `SUPABASE_ACCESS_TOKEN` still needed from Anton |
| M4 | **merged** 2026-11-07, live at `slot-order-api.antonsplavnik.workers.dev`, CI deploy on `main` proven; the production cron expired the demo hold on time (verified 2026-11-07) | #5 | 171 route tests + 38-test repository contract on both implementations; Worker deployed by hand once, CI deploy job for `main`; all Cloudflare and Supabase secrets set |
| M5 | not started | | |
| M6 | not started | | |

## Spec changes to record as they come up
(Each entry: date, what changed, which § was updated, the commit.)
- 2026-11-07, M4 (after the implementer's report): §10.4 decisions: impossible calendar dates → `validation`; `/slots` releases holds on open days only; `setCheckout` stores the session id until M5; `InvalidStatusError` → `internal`; bad env → 500 with names only. Staff auth moved to §10.5.
- 2026-11-07, M4 (after the test agent's report): §10.4 preflights pass without the token; §12 three cart codes never reach the API (the schema refuses first); `createdAt` is database time. The test agent mutation-tested its suite with a throwaway reference implementation (6 planted bugs, all caught). Local stack restarted under the linked project name (`supabase link` changed the container prefix).
- 2026-11-07, M4 (contract): §10 rewritten: the route table with `201` for orders and `checkoutUrl: null` until M5, §10.1 the response schemas (`PublicMenu` without promo codes, `OrderSummary` with state-dependent fields, `StaffBoard` over every grid slot), §10.2 the `Repository` interface with a contract test over both implementations, §10.3 `AppDeps`, §10.4 staff auth; §12 `not_found` for unknown routes; core exports `slotLabel`.
- 2026-11-07, M3 (cloud): §14 `supabase db push --remote` (CLI 3 targets the local database without the flag; found when the first push applied nothing); the seed applied once with `--include-seed`; the project ref recorded. RLS verified against the cloud: anon reads `[]`, rpc refused `42501`.
- 2026-11-06, M3 (after the implementer's report): §5 `reserve_for_paid` updates the order before reserving the slot (same lock order as `release_hold`); `release_slot` raises `invalid_items`; `release_expired_holds` uses `FOR UPDATE SKIP LOCKED` and `<`; extra CHECKs listed; `stripe_events.order_id` has no foreign key; explicit `GRANT … TO service_role`. Harness: PostgREST warmed up after `db reset` (stale connections made a race test flaky back to back).
- 2026-11-06, M3 (after the test agent's report): `promo_codes.sort`; §5 notes that PostgREST returns a `NULL` row as an all-null object (M4 checks `id === null`).
- 2026-11-06, M3 (contract): §5 function signatures take `p_now` / `p_hold_expires_at` / `p_payment_intent_id`; `release_slot` returns the row; `slot_booked_mismatches()` added; `combo_components.sort`; migrations named `<timestamp>_<name>.sql`; the row mapping `apps/api/src/db/rows.ts`; `VAT_RATES_DE_2026` in core; §13 Database row rewritten.
- 2026-11-06, M2 (after the test agent's report): §7.3 round robin for all-zero weights; §7.4 parts food before drink, a combo's `vatCategory` ignored, a combo line split as one line, worked example 2's decimals corrected; §7.2 line order made explicit, a blank promo code means none. The brief's wings-menu allocation was wrong (600/323/267 is right).
- 2026-11-06, M2 (contract): §7 rewritten with §7.6 as the API contract (`priceCart(menu, cart)`, the VAT rates inside the `Menu`, `allocate`, `splitVat`, `itemCount`; a combo counts as one item; `duplicate_option` added; promo matching rule; the second worked example with `HAHN10`); §8.3 the orders API (`pickupCode(bytes)`, `normalizePickupCode`); §5 the seed's ids. `OrderSummary` and `StaffOrder` move from M2 to M4 in the plan.
- 2026-11-06, M1 (after the implementer's report): §6.3 wall-clock → instant conversion is core's own `wallToInstant` with a host-independent rule (ambiguous → first occurrence, gap → forward), because `TZDate`'s constructor answers differently on a UTC and a Berlin host; the core suite runs under both `TZ`s in CI. §6.2 `slot_past_cutoff` also when `start ≤ now` (cut-off 0). §6.3 the duplicate-slot guard for a boundary in the spring gap. In the M1 green commit.
- 2026-11-06, M1 (after the test agent's report): §6.3 the DST days are Sundays, so the 44-slot claim needs Sunday opened; §6.2 ranges may touch, `"24:01"`–`"24:59"` refused, `too_many_items` is the configured capacity. The brief's cut-off example was wrong (12:15 is bookable at 12:00); the tests follow §6.1.
- 2026-11-06, M1: §6.2 rewritten as the API contract (signatures, `SlotUsage`/`Booked`, reason and error orders); §6.3: an ambiguous wall time resolves to its second occurrence (the draft said first); §4: date-fns versions. In the M1 tests commit.
- 2026-11-06, M0: §14 fixes the CI shape for `test:db` (`supabase start -x …`, 1 min 35 s measured) and notes that `compatibility_date = 2026-11-06` enables Node.js compatibility without `nodejs_compat`; written in the M0 commit.

## Environment notes (learned while building)
- `supabase link` (2026-11-07) changed the local container prefix to the project ref; the stack was restarted under it.
  `supabase status` and `pnpm test:db` work normally now; CI is unlinked and uses `config.toml`'s `slot-order`.
- Supabase CLI 3: `db push`, `migration list` need `--remote` for the linked project; without it they target the local
  database and print a JSON error. `--yes` is required from an agent run for anything that asks.
- `supabase db reset` restarts Postgres but PostgREST keeps stale connections for ~30 s: `apps/api/test/db/setup.ts`
  warms PostgREST up, so back-to-back `pnpm test:db` runs are green.
- `wrangler dev` overrides `[vars]` with `apps/api/.dev.vars`, so `wrangler.toml` carries production values
  (`SUPABASE_URL` of the cloud project) and `.dev.vars` the local ones.
- `brew upgrade` of `gh` made the binary vanish mid-command once; retry with `/opt/homebrew/bin/gh` or wait.
- GitHub takes 1–2 minutes to schedule a PR's workflow; "no checks reported" right after a push is normal.
- Secrets never printed: the `.env` and `.dev.vars` files are read with `set -a; . ./.env; set +a` and piped into
  `wrangler secret put` / `gh secret set --body`.

## Verification (every milestone)
1. `pnpm test`, `pnpm typecheck` and `pnpm check` pass; from M3, `pnpm test:db` passes locally and in CI.
2. The milestone's demo runs as described above.
3. From M4, the deployed API is checked after the merge (`curl …/health` and the milestone's curl demo).
4. Commit on the milestone branch, push, open the PR, then stop for Anton's review.
