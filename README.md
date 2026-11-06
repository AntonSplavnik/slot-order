# SlotOrder

![CI](https://github.com/AntonSplavnik/slot-order/actions/workflows/ci.yml/badge.svg)

Pre-ordering with pickup slots for a fictional halal chicken restaurant, **Goldhahn**: pick items, pick a 15-minute
slot, pay, get a QR code; staff see orders per slot and scan the code at pickup.

A work sample, built to try a stack on the kind of problem a restaurant's in-house software deals with: **Hono on
Cloudflare Workers**, **Supabase** (Postgres), **Stripe** Checkout, **Next.js** with Tailwind, and TypeScript end to end.
The interesting parts are the tested **time-slot** and **pricing** rules, and the way it was built: spec first, tests
first, AI agents writing against the tests, every milestone reviewed before the next.

## Architecture in 30 seconds

_Filled in during M4–M6._

## Run it

Prerequisites: Node 24+, pnpm 11 (pinned in `packageManager`), Docker, the Supabase CLI and the Stripe CLI
(`brew install supabase/tap/supabase stripe/stripe-cli/stripe`). Details in [docs/design.md §15](docs/design.md#15-development-setup).

```sh
pnpm install
supabase start                 # local Postgres + PostgREST in Docker
supabase db reset              # migrations + the Goldhahn seed, from scratch
pnpm dev                       # the API on http://localhost:8787 (and the web app on :3000 from M6)
curl localhost:8787/health     # {"ok":true}
```

_Supabase, Stripe and the web app are wired in during M3–M6._

## Tests

```sh
pnpm test        # core and API unit tests; no network, no database
pnpm --filter @slot-order/core test:berlin   # the core suite again with the process in Berlin time (§6.3)
pnpm typecheck   # TypeScript, with the Workers runtime types from `wrangler types`
pnpm check       # Biome lint and format (`pnpm format` fixes)
```

The slot rules (`packages/core/test/slots/`, 145 tests) cover the grid on both 2026 DST days, prep time, cut-off,
holds, the booking horizon in Berlin days, every reason and error in its order of precedence, and the config schema.
The pricing rules (`packages/core/test/pricing/`, 150 tests) cover validation and its order, integer VAT rounding,
discounts spread by largest remainder, combo splits, the VAT summary, two worked receipts and a seeded property test;
the order transitions and pickup codes (`test/orders/`, 77 tests). ```sh
pnpm test:db     # against local Supabase: migrations, seed, the SQL functions, RLS, and the 50-parallel reservation
```

The database suite (`apps/api/test/db/`, 78 tests) resets the local stack from the migrations and seed, maps the seed
back onto the core fixtures so they cannot drift, races 50 connections for the last place in a slot (exactly one wins,
also through PostgREST as production calls it), exercises every hold function with the booked-items invariant checked
after each, and proves the anon key reads nothing and can call nothing.

## What the agent got wrong and what I changed

Real cases, as they happened. Each entry: what the agent did, why it was wrong, what I changed, the commit.

- _(none yet)_

## Docs

- [docs/design.md](docs/design.md): the spec, the source of truth.
- [docs/plan.md](docs/plan.md): milestones with the risk each removes, its demo and its tests; status.
- [docs/handoffs/](docs/handoffs/): the briefs that moved context between agents and sessions.

## Live

_Filled in after M4 (API) and M6 (web)._
