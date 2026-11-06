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
- **Then implement** `src/pricing/{validate,allocate,vat,price}.ts`, `src/orders/{transitions,pickupCode}.ts`, the
  `Menu`, `Cart`, `Receipt`, `PricedLine`, `OrderStatus`, `OrderSummary`, `StaffOrder` schemas.
- **Fixture:** `packages/core/test/fixtures/menu.ts` is the Goldhahn menu as `core` sees it; M3's `seed.sql` is written
  from it, and a `test:db` test compares the two (so the seed and the fixture cannot drift).
- **Demo:** a test prints the §7.4 receipt (lines, VAT per rate, total).

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
- **Research first:** the `stripe` package on Workers (fetch client, SubtleCrypto provider, `nodejs_compat`); record in
  §17 and §14.
- **Tests first:** Checkout Session creation (line items match the receipt to the cent, `expires_at` = +30 min,
  metadata, URLs; the fake `Payments` records the call), Stripe failure → released hold + 502, the webhook cases of §13
  (signature with `generateTestHeaderString`, duplicate event, `completed`, `expired`, unknown order, failure removes the
  event row, the expired-then-paid race with re-reserve and with refund), the cron sequence (§8.3).
- **Then implement** `src/payments/{types,stripe,fake}.ts`, `src/routes/webhook.ts`, the cron.
- **Stripe setup:** test keys into `.dev.vars` and Worker secrets; the webhook endpoint in the dashboard for the Worker;
  `stripe listen` locally.
- **Demo:** `POST /orders` → open `checkoutUrl` → test card → `GET /orders/:id` is `paid` with a pickup code;
  `stripe trigger` or a replayed event shows the duplicate answered with `duplicate: true` and one `paid` order.

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
  green, what is open, the next step) and the next session starts fresh from it. Milestone status is kept in this file
  ("Status" below).
- **Review gate.** A milestone ends when tests, typecheck and lint pass and the demo works. The orchestrator commits on a
  branch `m<N>-<name>`, pushes it so CI runs, opens a PR, and **stops**. Anton reviews and runs it; what he changes or
  asks to change is an entry for the README's "What the agent got wrong" (with the commit). He merges; `main` deploys.
  (The brief says "only reviewed work is pushed"; a reviewed PR branch is the way this plan reads it, so CI and the
  review happen in the open. Anton can change this to "push after review" in CLAUDE.md.)
- **Migrations** are tested with `supabase db reset` locally before they reach a PR; `supabase db push` runs only from CI
  on `main` (and once by hand in M3).

## Status

| Milestone | State | PR | Notes |
|---|---|---|---|
| Spec, plan, CLAUDE.md | written 2026-11-06, **awaiting review** | — | |
| M0 | not started | | |
| M1 | not started | | |
| M2 | not started | | |
| M3 | not started | | |
| M4 | not started | | |
| M5 | not started | | |
| M6 | not started | | |

## Spec changes to record as they come up
(Empty. Each entry: date, what changed, which § was updated, the commit.)

## Verification (every milestone)
1. `pnpm test`, `pnpm typecheck` and `pnpm check` pass; from M3, `pnpm test:db` passes locally and in CI.
2. The milestone's demo runs as described above.
3. From M4, the deployed API is checked after the merge (`curl …/health` and the milestone's curl demo).
4. Commit on the milestone branch, push, open the PR, then stop for Anton's review.
