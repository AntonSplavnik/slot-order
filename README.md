# SlotOrder

![CI](https://github.com/AntonSplavnik/slot-order/actions/workflows/ci.yml/badge.svg)

Pre-ordering with pickup slots for a fictional halal chicken restaurant, **Goldhahn**: pick items, pick a 15-minute
slot, pay, get a QR code; staff see orders per slot and scan the code at pickup.

A work sample, built to try a stack on the kind of problem a restaurant's in-house software deals with: **Hono on
Cloudflare Workers**, **Supabase** (Postgres), **Stripe** Checkout, **Next.js** with Tailwind, and TypeScript end to end.
The interesting parts are the tested **time-slot** and **pricing** rules, and the way it was built: spec first, tests
first, AI agents writing against the tests, every milestone reviewed before the next.

## Architecture in 30 seconds

```
browser ── Next.js on Workers (apps/web) ──▶ Hono on Cloudflare Workers (apps/api) ──▶ Supabase Postgres (supabase/)
                              │  every route: validate with a core schema → call core → repository → map
                              ├──▶ Stripe Checkout (test mode) + idempotent webhook
                              └── Cron Trigger every minute: release expired holds, expire their sessions
```

- **`packages/core`**: the rules, pure TypeScript with no I/O: slots (grid, DST, prep time, cut-off, horizon),
  pricing (integer cents, VAT per part, promo codes), order transitions, pickup codes, and every API schema (Zod).
  Most of the tests live here.
- **`apps/api`**: Hono on Workers. A `Repository` interface with two implementations, in-memory for the route tests
  and Supabase for production, held to one contract test that runs against both. Capacity is enforced only in
  Postgres: `reserve_slot` is one conditional `UPDATE`, so 50 concurrent callers for the last place get exactly one
  winner.
- **`supabase/`**: plain SQL migrations (tables with CHECKs, RLS on with no policies, the functions), the seed.
- **`apps/web`**: Next.js App Router with Tailwind, deployed to Workers with OpenNext. Screens only: the menu with
  option sheets, checkout with the day strip and slot chips, the status page with the QR code, the staff board and
  the QR check-in. A small pure library (`src/lib/`, tested) does the cart, the texts and the API client, which
  validates every answer with the core schemas; the cart is priced locally with `core`.

## Run it

Prerequisites: Node 24+, pnpm 11 (pinned in `packageManager`), Docker, the Supabase CLI and the Stripe CLI
(`brew install supabase/tap/supabase stripe/stripe-cli/stripe`). Details in [docs/design.md §15](docs/design.md#15-development-setup).

```sh
pnpm install
supabase start                 # local Postgres + PostgREST in Docker
supabase db reset              # migrations + the Goldhahn seed, from scratch
cp apps/api/.dev.vars.example apps/api/.dev.vars   # local service-role key from `supabase status`, a STAFF_TOKEN,
                               # Stripe test keys (sk_test_…, and the whsec_ printed by `stripe listen`)
cp apps/web/.env.example apps/web/.env.local       # NEXT_PUBLIC_API_URL, the local API
pnpm dev                       # the API on http://localhost:8787 and the web app on http://localhost:3000
stripe listen --forward-to localhost:8787/webhooks/stripe   # another terminal: Stripe's events reach the local API
curl localhost:8787/health     # {"ok":true}
curl localhost:8787/menu       # the Goldhahn menu from the local database
curl "localhost:8787/slots?date=2026-11-09"
```

## Tests

```sh
pnpm test        # core (373), web library (218) and API tests (287: routes, webhook, payments); no network
pnpm --filter @slot-order/core test:berlin   # the core suite again with the process in Berlin time (§6.3)
pnpm typecheck   # TypeScript, with the Workers runtime types from `wrangler types`
pnpm check       # Biome lint and format (`pnpm format` fixes)
```

The slot rules (`packages/core/test/slots/`, 145 tests) cover the grid on both 2026 DST days, prep time, cut-off,
holds, the booking horizon in Berlin days, every reason and error in its order of precedence, and the config schema.
The pricing rules (`packages/core/test/pricing/`, 150 tests) cover validation and its order, integer VAT rounding,
discounts spread by largest remainder, combo splits, the VAT summary, two worked receipts and a seeded property test;
the order transitions and pickup codes (`test/orders/`, 77 tests).

```sh
pnpm test:db     # against local Supabase: migrations, seed, the SQL functions, RLS, the 50-parallel reservation,
                 # and the repository contract against the real database
```

The database suite (`apps/api/test/db/`, 122 tests) resets the local stack from the migrations and seed, maps the seed
back onto the core fixtures so they cannot drift, races 50 connections for the last place in a slot (exactly one wins,
also through PostgREST as production calls it), exercises every hold function with the booked-items invariant checked
after each, runs the repository contract against the real database, and proves the anon key reads nothing and can call
nothing.

## What the agent got wrong and what I changed

Real cases, as they happened. Each entry: what the agent did, why it was wrong, what I changed, the commit.

- _(none yet)_

## Docs

- [docs/design.md](docs/design.md): the spec, the source of truth.
- [docs/plan.md](docs/plan.md): milestones with the risk each removes, its demo and its tests; status.
- [docs/handoffs/](docs/handoffs/): the briefs that moved context between agents and sessions.

## Live

- **API:** https://slot-order-api.antonsplavnik.workers.dev (Cloudflare Workers, Frankfurt-region Supabase behind it).
  Try `GET /health`, `GET /menu`, `GET /slots?date=YYYY-MM-DD` (Sundays answer `closed`). Deployed by CI from `main`.
- **Web app:** https://slot-order-web.antonsplavnik.workers.dev (Next.js on Workers via OpenNext). The customer
  flow pays with Stripe's test card `4242 4242 4242 4242`; `/staff` asks for the staff token.
