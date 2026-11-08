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
pnpm dev:phone                 # both bound to the Mac's LAN address, to review on a phone over Wi-Fi without a deploy
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

- **2026-11-07, M6, PR #7: the web app looked bare.** The first version worked end to end on the phone (menu →
  options → slot → Stripe test card → QR code → check-in on a second phone), but it was plain lists and
  default-looking buttons. The spec said "no design system beyond Tailwind defaults and one accent colour", and the
  agent read that as licence for no design at all. I flagged it in the review ("looks very pure") and asked for a
  polish pass with the look spelled out: a header with the name and a cart badge, item cards, a real bottom sheet
  for options, slot chips with states, a card-style status page with the code in large letters, tidier staff cards.
  Commit `a269fcf`: screens and components only; the library, its 218 tests and every behaviour unchanged.
- **2026-11-08, M6, second review: the polish was tidy but still not the look of a real ordering app.** I set a
  reference, Uber Eats' store layout (the same skeleton for every restaurant there), and chose coloured tiles over
  photos, since the made-up menu has none. The agent had read the spec's "no design system beyond Tailwind
  defaults" as a reason to stop at cards and buttons; the fix was a reference, not more words. Commit `b712312`:
  the screens rebuilt on that skeleton (cover band, sticky section tabs, a two-column tile grid, tagged option
  groups with a pinned Add button, the cart-style checkout, a progress line on the status page), one new tested
  library file for the tiles, behaviour otherwise unchanged. The reference screenshots stay outside git.
- **2026-11-08, M6, third review: the layout matched the reference, the look still did not.** Pass 2 had copied
  the skeleton but kept approximations: the system font, Tailwind's default greys, 4:3 tiles, 52 px buttons. I
  asked for a pass that matches the reference's fonts, shapes and colours exactly, and the agent measured the
  screenshots pixel by pixel instead of eyeballing them: colours sampled, type sizes from cap heights, radii and
  heights from scan lines; the reference's typeface is proprietary, so it rendered four open candidates beside it
  and chose Figtree. Before letting it build, I installed design skills (accessibility, layout, writing,
  typography, colour, motion, mobile) and had the plan checked against them first; that caught a failing error
  colour (4.3:1), truncation with no way back, a modal that never managed focus, and safe-area insets that were
  silently 0. Commit `514a81a`: screens and tokens; one tested library function for the tile's quantity badge; the
  spec (§11.7) carries every number and the review.
- **2026-11-08, M6, fourth review: the "+" on a tile put items without options straight into the cart.** Pass 3
  had kept a shortcut from the first version: a tile's round "+" added an item without option groups at once and
  opened the sheet only for items with groups. In the reference the "+" always opens the item's page, and the page
  is where the item is added. I sent 17 more screenshots of item pages and asked for that, with one exception I
  added while the work ran: drinks go straight into the cart, and a last screenshot showed what their button
  becomes after an add (a "−" / count / "+" pill in the tile's corner). I also asked for more motion, planned
  with the motion skills before the implementer ran. Commit `a1090ec`: a full-screen item page with an exit
  animation, the drink pill, twelve motions, four tested library functions; the spec (§11.9) carries the
  measurements, the motion plan and the two calls I can still flip (a drink's tile tap adds one; the page's
  drink rows carry the pill).

## Docs

- [docs/design.md](docs/design.md): the spec, the source of truth.
- [docs/plan.md](docs/plan.md): milestones with the risk each removes, its demo and its tests; status.
- [docs/handoffs/](docs/handoffs/): the briefs that moved context between agents and sessions.

## Live

- **API:** https://slot-order-api.antonsplavnik.workers.dev (Cloudflare Workers, Frankfurt-region Supabase behind it).
  Try `GET /health`, `GET /menu`, `GET /slots?date=YYYY-MM-DD` (Sundays answer `closed`). Deployed by CI from `main`.
- **Web app:** https://slot-order-web.antonsplavnik.workers.dev (Next.js on Workers via OpenNext). The customer
  flow pays with Stripe's test card `4242 4242 4242 4242`. `/staff` and the QR check-in ask for the staff token
  once; it is not in the repo (§3 Trust boundary) and is shared privately with reviewers, since the demo runs in
  test mode on fictional data.
