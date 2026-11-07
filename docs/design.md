# SlotOrder — Design

**Date:** 2026-11-06 (draft for review; nothing built yet)
**Status:** the spec for milestones M0–M6 in `docs/plan.md`. A bare § means a section of this file. This file is the
source of truth: when the implementation has to deviate, the deviation is written back here in the same commit.

## 1. Purpose

SlotOrder is a small pre-order system for a fictional halal chicken restaurant, **Goldhahn** (Berlin): a customer picks
items from the menu, picks a 15-minute pickup slot, pays online and gets a QR code; staff see the orders per slot and scan
the code at pickup.

It is a **work sample**, built to show two things in the stack a Berlin restaurant group uses in-house (Hono on
Cloudflare Workers, Supabase, Stripe, Next.js with Tailwind):

1. productive work in that stack, most of which was new to the author;
2. **tested time-slot and pricing logic**, built with an AI-assisted workflow in which the author stays in control of what
   the agents write (spec first, test first, review gate per milestone, `README` section "What the agent got wrong and
   what I changed").

It is not a product. Scope is deliberately small: a tested core with a short README beats a half-built full app.

**Success criteria**
- `pnpm test` runs the slot, pricing, order-state and API suites in under a minute with no network access.
- `pnpm test:db` proves against a real Postgres that **50 parallel reservations of the last free place produce exactly one
  winner**, and that the slot counts stay consistent after holds expire.
- On a phone: order → pay with a Stripe test card → QR code; the staff board shows the order in its slot; opening the QR
  code's link marks it picked up.
- CI green on every push; the API live on Cloudflare Workers, the web app live on Cloudflare, the database on Supabase.
- The README's "What the agent got wrong" section has real entries with commit links.

## 2. Scope

### In
- A menu with items, option groups (min/max choices, price deltas) and fixed combos (§7).
- Pickup slots from opening hours: 15-minute slots, capacity in items, prep time, cut-off, holds, a booking horizon (§6).
- Pricing in integer cents with German VAT split per rate, one rounding rule, and promo codes (§7).
- Order lifecycle `held → paid → ready → picked_up` with `expired` and `cancelled` (§8).
- Stripe Checkout in test mode with an idempotent webhook (§9).
- A Hono API on Cloudflare Workers with a Cron Trigger that releases expired holds (§10).
- A Next.js customer flow (menu → slot → pay → QR) and a staff board with QR check-in (§11).
- No overbooking under concurrency, enforced in Postgres (§5, §13).
- GitHub Actions: checks on every push and pull request; deploys from `main` (§14).

### Not in (see §16 Later)
- Customer accounts. An order is addressed by its UUID (unguessable) and its pickup code.
- Real staff authentication. Staff endpoints take one shared token (`STAFF_TOKEN`).
- Eat-in orders, table service, delivery. Everything is pickup.
- Refund UI, partial refunds, order edits after payment.
- Menu or opening-hours administration. Both come from `supabase/seed.sql`.
- A POS adapter (the plan's M7; only if time is left after M6).
- German UI, multiple restaurants, inventory, email or SMS, rate limiting.

## 3. Key decisions

| Topic | Decision |
|---|---|
| Restaurant | Fictional: **Goldhahn**, a made-up halal chicken menu (§5 Seed). No real company's name, logo, menu, photos or texts anywhere in the repo. |
| Money | Integer cents everywhere. Menu prices are **gross** (VAT included), as German menus show them. VAT is derived per line (§7.4). |
| VAT | Germany, 2026: **food 7 %** (since 2026-01-01 also when eaten in, Steueränderungsgesetz 2025), **drinks 19 %**. Each menu item has a `vat_category` of `food` or `drink`; the rates sit in one table in `core` (§7.4, §17). |
| Capacity | Counted in **items** per slot (a kitchen cooks portions, not orders): the sum of the lines' quantities, a combo counting as one. Default 20 items per 15 minutes. |
| Slot grid | Computed in `core` from the opening hours, in instants (UTC milliseconds), 15 minutes apart; wall-clock times only for labels and for the opening hours themselves. So DST days have fewer or more slots and never a missing or duplicated one (§6.3). |
| Slot rows | `slots` rows are created lazily by the reservation function. A slot without a row has `capacity − 0` available. The database enforces capacity; `core` enforces everything else (grid, prep time, cut-off, horizon). |
| No overbooking | One SQL function, `place_hold`, reserves the items and inserts the order in **one transaction** with a single conditional `UPDATE … WHERE booked + n <= capacity`. Proven by `pnpm test:db` (§13). |
| Holds | A hold lasts 10 minutes. `slots.booked` counts held and paid items alike. A Workers Cron Trigger runs every minute: `release_expired_holds()` in SQL, then the released Stripe sessions are expired best-effort (§8.3). |
| Stripe vs. hold | A Checkout Session cannot expire in under 30 minutes (§17), so our 10-minute hold is shorter than Stripe's. The cron expires the session when the hold ends; if a customer still pays in the gap, the webhook tries to reserve the slot again and refunds if it cannot (§8.3, §9.3). |
| Webhook | Idempotent: `stripe_events.id` is the primary key; the event is inserted before it is processed; a duplicate answers 200 and does nothing. Every transition is also a conditional `UPDATE` (`WHERE status = 'held'`), so a double delivery cannot pay an order twice (§9.2). |
| Trust boundary | Only the Worker talks to Supabase, with the **service-role key** kept as a Worker secret. RLS is enabled on every table with **no policies**, so the anon key reads nothing. The browser never holds a Supabase key (§4). |
| Staff | `Authorization: Bearer <STAFF_TOKEN>` on `/staff/*`. The staff pages keep the token in `localStorage`. A deliberate simplification, named as such in the README. |
| Pickup code | 8 characters from Crockford's base32 alphabet (no `I`, `L`, `O`, `U`), generated when the order is created, shown only once the order is paid. The QR code encodes the staff pickup URL `/staff/pickup?code=…`, so staff scan it with the phone's camera app; no in-app scanner. |
| Price snapshot | An order stores its priced lines and receipt as JSON, so later menu changes never alter a past order. |
| Time | `date-fns` 4 with `@date-fns/tz` in `core` (pure JS, runs on Workers, Node and browsers). `now` is injected everywhere, never read from the clock inside `core`. |
| Web hosting | Next.js on Cloudflare Workers via `@opennextjs/cloudflare`. If it fights back in M6, Vercel is the fallback and the spec is updated. |
| Language | English everywhere (code, docs, UI). Menu item names carry German flavour (*Halbes Hähnchen*). |
| Tooling | pnpm workspace, strict TypeScript, Biome for lint and format, Vitest everywhere, Zod 4 schemas in `core` for every API shape. No build step for `core`: `api` and `web` import its `src/` directly. |

## 4. Architecture

```
slot-order/
  packages/core/    pure TypeScript: slot rules, pricing, order transitions, Zod schemas, pickup codes. No I/O.
  apps/api/         Hono on Cloudflare Workers: routes, Supabase repository, Stripe, webhook, cron handler
  apps/web/         Next.js (App Router) + Tailwind: customer flow and staff board; talks only to the API
  supabase/         config.toml, migrations/*.sql, seed.sql (the Goldhahn menu and settings)
  docs/             design.md (this file), plan.md, handoffs/
  .github/          workflows/ci.yml
```

```
phone / laptop ── Next.js on Cloudflare (apps/web) ── fetch ──▶ Hono Worker (apps/api)
                                                                 │  supabase-js, service role
                                                                 ├────────────────────────▶ Supabase Postgres
                                                                 │        RPC: place_hold, release_hold, reserve_slot,
                                                                 │             release_expired_holds
                                                                 ├── Stripe SDK (fetch) ──▶ Stripe (test mode)
                                                                 ◀── POST /webhooks/stripe ──┘
                                                                 └── Cron Trigger, every minute → release expired holds
```

### Units
- **`packages/core`** (`@slot-order/core`): everything that can be tested without I/O. Exports `src/index.ts`. Its
  `tsconfig` has `types: []`, so any Node API used there fails the typecheck. Depends only on `zod`, `date-fns` and
  `@date-fns/tz`.
- **`apps/api`** (`@slot-order/api`): the only unit that talks to the database and to Stripe. A `Repository` interface
  (`src/repo/types.ts`, §10.2) with a Supabase implementation and an in-memory fake used by the route tests, both
  held to one contract test. A `Payments` interface with a Stripe implementation and a fake (M5). Routes stay thin:
  validate with the `core` schemas, call `core`, call the repository, map errors.
- **`apps/web`** (`@slot-order/web`): screens only. It imports `core` for the schemas and for pricing the cart locally
  (the server re-prices on order), and calls the API through one small client (`src/lib/api.ts`). `next.config`
  lists `@slot-order/core` in `transpilePackages`.
- **`supabase/`**: plain SQL migrations (`<timestamp>_<name>.sql`, as the CLI orders them), the SQL functions, the seed.
  Applied locally with `supabase db reset`, to the cloud with `supabase db push --remote` from CI.

### Technology
| Part | Choice |
|---|---|
| Language | TypeScript 5, strict, `noUncheckedIndexedAccess`, Bundler resolution |
| Schemas | Zod 4 |
| API | Hono 4 on Cloudflare Workers, `wrangler` 4 (a devDependency, no global install) |
| Database | Supabase (Postgres 17), `supabase-js` 2, Supabase CLI for local dev and migrations |
| Payments | `stripe` (stripe-node) with the fetch HTTP client and the SubtleCrypto provider for webhook signatures (§9.2) |
| Web | Next.js 16 (App Router), Tailwind 4, `qrcode` for the QR code as SVG, `@opennextjs/cloudflare` for deployment |
| Time | `date-fns` 4.4.0, `@date-fns/tz` 1.5.0 (`TZDate`; instant arithmetic with `addMinutes`, labels with `format`) |
| Tests | Vitest; Hono's `app.request()` for routes; `supabase-js` and `postgres` (porsager) against local Supabase for `test:db` |
| Lint/format | Biome 2 (same config as the author's other projects: spaces, line width 100) |
| CI/CD | GitHub Actions |

## 5. Data model

All tables in schema `public`, RLS enabled with no policies (§3 Trust boundary). Times are `timestamptz`. Money columns
are `integer` cents.

### `settings` — one row, `id = 1`
| Column | Type | Note |
|---|---|---|
| `timezone` | text | `Europe/Berlin` |
| `slot_minutes` | int | 15 |
| `capacity_per_slot` | int | 20 (items) |
| `prep_minutes` | int | 20 |
| `cutoff_minutes` | int | 5 |
| `hold_minutes` | int | 10 |
| `max_days_ahead` | int | 7: today and the next 6 days can be booked |
| `opening_hours` | jsonb | `{"mon":[["11:00","22:00"]], …, "sun":[]}`; a day may have several ranges (a lunch break) |

`core` reads this row as a `SlotConfig` (Zod schema). The API reads it once per request.

### `menu_items`
| Column | Type | Note |
|---|---|---|
| `id` | text PK | a slug: `chicken-burger` |
| `name`, `description` | text | |
| `price_cents` | int | gross |
| `vat_category` | text | `food` or `drink` (CHECK) |
| `kind` | text | `item` or `combo` (CHECK) |
| `sort` | int | menu order |
| `active` | bool | inactive items are not listed and cannot be ordered |

### `option_groups` — `id` text PK, `item_id` → `menu_items`, `name`, `min_choices`, `max_choices`, `sort`.
Only `kind = 'item'` rows have groups; combos have none (CHECK by trigger is overkill: the seed and the pricing tests keep it so).

### `options` — `id` text PK, `group_id` → `option_groups`, `name`, `price_delta_cents` (may be 0 or negative), `sort`.

### `combo_components` — `combo_id` → `menu_items`, `item_id` → `menu_items`, `quantity` int, `sort` int; PK `(combo_id, item_id)`.

### `promo_codes` — `code` text PK (upper case), `kind` (`percent` or `fixed`), `value` int (0–100, or cents), `active` bool, `sort` int.

### `slots`
| Column | Type | Note |
|---|---|---|
| `starts_at` | timestamptz PK | the slot's instant |
| `capacity` | int | copied from `settings` when the row is created (§3 Slot rows) |
| `booked` | int | items held or paid; `CHECK (booked >= 0 AND booked <= capacity)` |

### `orders`
| Column | Type | Note |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `status` | text | `held`, `paid`, `ready`, `picked_up`, `expired`, `cancelled` (CHECK) |
| `slot_start` | timestamptz | → `slots` |
| `customer_name` | text | 1–60 characters |
| `lines` | jsonb | the priced lines (`PricedLine[]`, §7.5) |
| `receipt` | jsonb | the `Receipt` (§7.5): subtotal, discount, total, VAT per rate |
| `item_count` | int | what was reserved in the slot |
| `total_cents` | int | copied from the receipt for listing |
| `promo_code` | text, null | |
| `pickup_code` | text, unique | §3 Pickup code |
| `stripe_session_id` | text, unique, null | |
| `checkout_url` | text, null | the Checkout Session's URL (§9.1); added by `20261107120000_checkout_url.sql` (M5) |
| `stripe_payment_intent_id` | text, null | from the completed session |
| `hold_expires_at` | timestamptz, null | set while `held` |
| `cancel_reason` | text, null | `stripe_failed`, `session_expired`, `refunded_slot_full` |
| `created_at`, `paid_at`, `ready_at`, `picked_up_at`, `expired_at`, `cancelled_at` | timestamptz | |

Indexes: `(slot_start)`, `(status, hold_expires_at)` for the cron. `settings` has `CHECK (id = 1)`: one row, ever.
CHECKs: `status` in its six values, `cancel_reason` in its three, `customer_name` 1–60 characters, `item_count ≥ 1`,
`pickup_code` 8 alphabet characters, `promo_code` 2–20 of A–Z 0–9, a `held` order has a `hold_expires_at`.

### `stripe_events` — `id` text PK (Stripe's `evt_…`), `type` text, `order_id` uuid null (no foreign key: an event for an
unknown order is still recorded, §9.2), `received_at` timestamptz.

### SQL functions (`supabase/migrations/20261106120100_functions.sql`)
All `LANGUAGE plpgsql`, called by the Worker as the service role through PostgREST (`supabase.rpc`), each call its
own transaction, so an exception rolls back everything the function did. Time is a parameter (`p_now`) wherever the
rules depend on it, so the tests control it; the API passes `new Date()` from its clock.

- `reserve_slot(p_starts_at timestamptz, p_items int, p_capacity int) returns slots`: `p_items < 1` → `RAISE
  EXCEPTION 'invalid_items'`; `INSERT INTO slots (starts_at, capacity, booked) VALUES (…, p_capacity, 0) ON CONFLICT DO
  NOTHING` (an existing row keeps its capacity, §3 Slot rows); then `UPDATE slots SET booked = booked + p_items WHERE
  starts_at = p_starts_at AND booked + p_items <= capacity RETURNING *`. No row updated → `RAISE EXCEPTION 'slot_full'`.
  The row lock of the `UPDATE` serialises concurrent callers; the `WHERE` makes the losers fail instead of overbooking.
- `release_slot(p_starts_at timestamptz, p_items int) returns slots`: `p_items < 1` → `invalid_items`; `booked = booked −
  p_items` (the CHECK keeps it ≥ 0).
- `place_hold(p_order jsonb, p_capacity int, p_hold_expires_at timestamptz) returns orders`: `reserve_slot` for
  `p_order->>'slot_start'` and `item_count`, then `INSERT INTO orders` with `status = 'held'` and the given expiry.
  `p_order` keys: `slot_start` (ISO 8601 with offset), `customer_name`, `lines` (array), `receipt` (object),
  `item_count`, `total_cents`, `promo_code` (or null), `pickup_code`. A failing insert rolls the reservation back.
- `release_hold(p_order_id uuid, p_status text, p_reason text default null, p_now timestamptz default now())
  returns orders`: `p_status` must be `expired` or `cancelled` (else `RAISE EXCEPTION 'invalid_status'`); `UPDATE
  orders SET status = p_status, expired_at | cancelled_at = p_now, cancel_reason = p_reason, hold_expires_at = null
  WHERE id = p_order_id AND status = 'held' RETURNING *`; when a row was updated, `release_slot` for its items and
  return it; otherwise return `NULL` (already moved on: callers treat that as done). Through PostgREST a `NULL` row
  arrives as an object whose every field is `null`, not as `null`: the repository (M4) checks `id === null`.
- `release_expired_holds(p_now timestamptz default now()) returns setof orders`: every `held` order with
  `hold_expires_at < p_now` (strictly), selected `FOR UPDATE SKIP LOCKED` (an order another transaction is moving right
  now is left for the next minute's run), through `release_hold(id, 'expired', null, p_now)`, returned so the Worker
  can expire their Stripe sessions.
- `reserve_for_paid(p_order_id uuid, p_capacity int, p_payment_intent_id text, p_now timestamptz default now())
  returns orders`: the webhook's second chance (§8.4) for an `expired` order (any other status → `invalid_status`):
  the conditional `UPDATE … WHERE status = 'expired'` to `paid` (`paid_at = p_now`, the payment intent stored) first,
  then `reserve_slot` again, which raises `slot_full` and rolls the update back. Order first, slot second, the same
  lock order as `release_hold`.
- `slot_booked_mismatches() returns table (starts_at timestamptz, booked int, counted bigint)`: the slots whose `booked`
  differs from Σ `item_count` of their orders in `held`, `paid`, `ready`, `picked_up` (§8.2 invariant); empty when
  all is well. For tests and for operators.

Privileges: `REVOKE EXECUTE` on every function from `public`, `anon` and `authenticated` (Supabase grants them by
default) and an explicit `GRANT EXECUTE … TO service_role`, so only the service role can call them; RLS keeps anon out of the tables (§3 Trust boundary). The normal
transitions `held → paid`, `paid → ready`, `paid | ready → picked_up` are conditional `UPDATE`s in the API (§8.2), not
functions.

### Row mapping (`apps/api/src/db/rows.ts`)
Pure functions from the tables' row shapes (snake_case, as `supabase-js` returns them) to core's types:
`menuFromRows({ items, groups, options, components, promoCodes }, vatRates): Menu` (items, groups, options,
components and promo codes ordered by `sort`; `description` omitted when null; `vatRates` from `VAT_RATES_DE_2026` in core) and
`slotConfigFromRow(settings): SlotConfig`. A `test:db` test proves the seed maps to the `core` fixtures `seedMenu` and
`seedConfig` exactly, so the seed and the fixtures cannot drift.

### Seed (`supabase/seed.sql`)
Settings: Mon–Sat 11:00–22:00, Sun closed; 15-minute slots; 20 items per slot; prep 20 min; cut-off 5 min; hold 10 min;
7 days ahead.

| Item | Gross | VAT | Options |
|---|---|---|---|
| Halbes Hähnchen (half chicken) | 8.90 | food | — |
| Chicken Burger | 7.90 | food | Size (1 of: regular +0, large +1.50); Sauce (0–2 of: garlic, chili, honey mustard, +0) |
| Chicken Wings, 6 pieces | 6.50 | food | Heat (1 of: mild, hot) |
| Fries | 3.50 | food | Size (1 of: regular +0, large +1.00) |
| Coleslaw | 2.90 | food | — |
| Ayran | 2.50 | drink | — |
| Cola 0.33 l | 2.90 | drink | — |
| Water 0.5 l | 2.50 | drink | — |
| **Burger Menu** (combo) | 12.90 | split | Chicken Burger + Fries + Cola (standalone 14.30) |
| **Wings Menu** (combo) | 11.90 | split | Chicken Wings + Fries + Cola (standalone 12.90) |

Ids (slugs, shared by the seed, the `core` test fixture `packages/core/test/fixtures/menu.ts` and M3's seed check):
items `half-chicken`, `chicken-burger`, `chicken-wings`, `fries`, `coleslaw`, `ayran`, `cola`, `water`; combos
`burger-menu`, `wings-menu`; groups `chicken-burger-size` (`burger-regular`, `burger-large`), `chicken-burger-sauce`
(`sauce-garlic`, `sauce-chili`, `sauce-honey-mustard`), `chicken-wings-heat` (`wings-mild`, `wings-hot`), `fries-size`
(`fries-regular`, `fries-large`).

Promo codes: `HAHN10` (10 %), `WELCOME3` (3.00 off), `OLD` (50 %, inactive).

## 6. Slot rules (`packages/core/src/slots/`)

### 6.1 Definitions
- A **day** is a calendar date in the restaurant's timezone.
- The **grid** of a day: for each opening range `[open, close)` of that weekday, slots start at `open`, `open + slot`,
  … as long as `start + slot <= close`. Computed in instants: `open` and `close` are converted to instants with
  `@date-fns/tz` (`TZDate`), the walk adds `slot_minutes` in milliseconds. "24:00" as a closing time means midnight of
  the next day.
- **Earliest start** = the first grid slot whose start is `>= now + prep_minutes` ("rounded up to the next slot start").
- **Cut-off**: a slot can be ordered while `now <= start − cutoff_minutes`.
- **Horizon**: days from today to today + `max_days_ahead − 1` can be booked.
- **Available** = `capacity − booked` (booked includes holds).
- A slot is **bookable** for `n` items when it is on the grid, `start >= earliest`, `now <= start − cutoff`,
  and `available >= n`.

### 6.2 API (`packages/core/src/slots/index.ts`; types and schemas in `src/schemas/slots.ts`)
All functions are pure; `now` and the config are arguments. Instants are `Date`s; a slot is identified by its instant.

- `SlotConfig` (Zod): `{ timezone, slotMinutes, capacityPerSlot, prepMinutes, cutoffMinutes, holdMinutes, maxDaysAhead,
  openingHours }`. `openingHours` maps `mon` … `sun` to `[open, close][]` of `"HH:MM"` strings; `close > open`;
  `"24:00"` is allowed only as a close (`"24:01"` … `"24:59"` are refused); a day's ranges are sorted and do not
  overlap, but may touch (`[open, close)` is half-open, so `11:00–14:00` and `14:00–18:00` are fine); a day with `[]`
  is closed. The schema refuses anything else.
- `DayString` = `"YYYY-MM-DD"` (a calendar day in the config's timezone). `Slot = { start: Date; label: string }`,
  the label `"HH:MM"` in the config's timezone. `SlotUsage = { booked: number; capacity: number }`;
  `Booked = ReadonlyMap<number, SlotUsage>` keyed by `start.getTime()`, one entry per slot that has a row (§3 Slot rows);
  a missing entry means `{ booked: 0, capacity: config.capacityPerSlot }`.
  `SlotReason = "past" | "cutoff" | "too_soon" | "full"`. `SlotAvailability = Slot & { available: number; bookable: boolean; reason?: SlotReason }`.
  `DayStatus = "open" | "closed" | "past" | "too_far"`. `SlotErrorCode = "closed_day" | "too_far" | "slot_not_on_grid" | "slot_past_cutoff" | "slot_too_soon" | "too_many_items" | "slot_full"`.
  `SlotCheck = { ok: true; slot: Slot } | { ok: false; code: SlotErrorCode }`.
- `todayIn(config, now): DayString` — the calendar day of `now` in the timezone.
- `dayOf(config, instant): DayString` — the same for any instant.
- `slotGrid(config, day): Slot[]` — the day's slots in order (§6.1); `[]` for a closed day.
- `dayStatus(config, day, now): DayStatus` — in this order: `closed` (no ranges that weekday), `past` (before
  `todayIn`), `too_far` (`day ≥ today + maxDaysAhead`), else `open`.
- `earliestStart(config, day, now): Date | null` — the first slot of the day's grid with `start ≥ now + prepMinutes`;
  `null` when the day has none left.
- `listSlots(config, day, now, booked, items = 1): SlotAvailability[]` — every grid slot with
  `available = capacity − booked`, `bookable`, and for a slot that is not bookable the first reason that applies, in
  this order: `past` (`start ≤ now`), `cutoff` (`now > start − cutoffMinutes`), `too_soon` (`start < earliestStart`),
  `full` (`available < items`).
- `checkSlot(config, start, items, now, booked): SlotCheck` — the rule behind `POST /orders`, the first error that
  applies in this order: `closed_day` (the day of `start` has no ranges), `too_far`, `slot_not_on_grid` (`start` is not
  an instant of that day's grid), `slot_past_cutoff` (`start ≤ now` or `now > start − cutoffMinutes`; the first part matters only with
  `cutoffMinutes: 0`, and covers any past slot and any past day), `slot_too_soon`, `too_many_items` (`items > capacityPerSlot`: an order never exceeds the configured slot capacity, whatever an older
  slot row's capacity says), `slot_full` (`available < items`).
- `holdExpiry(config, now): Date` — `now + holdMinutes`.

Wall-clock times are turned into instants by `wallToInstant` in `src/slots/time.ts` (§6.3), `"24:00"` as the next
day's midnight; `TZDate` is used only to read an instant's wall clock (labels, days, weekdays).

### 6.3 DST
Because the grid is walked in instants, 2026-03-29 (clocks forward) and 2026-10-25 (clocks back) need no special code;
they need tests:
- Both DST days of 2026 are Sundays, which the seed closes; with the seed hours and Sunday opened 11:00–22:00 (a test
  config) both days have 44 slots, 15 minutes apart, labelled 11:00 … 21:45, and the Saturday and Monday around each
  change have their usual 44 too.
- With a 00:00–24:00 test config, 2026-03-29 has 92 slots and 2026-10-25 has 100; no label is missing and no instant
  repeats (the two "02:xx" hours in October are different instants with the same labels, which is right: the kitchen
  works both of them).
- Wall-clock times are converted to instants by core's own `wallToInstant` (built on `tzOffset` from `@date-fns/tz`),
  not by `TZDate`'s constructor, because that constructor resolves an ambiguous time differently depending on the
  **host machine's** timezone (measured with 1.5.0: second occurrence on a UTC host, first on a Berlin host). The rule,
  the same as Temporal's `compatible` disambiguation and host-independent: a time that does not exist (02:30 on
  2026-03-29) moves forward by the length of the gap (03:30 CEST); an ambiguous time (02:30 on 2026-10-25) is its
  **first** occurrence (02:30 CEST, +02:00). Both are pinned by tests, and the core suite runs in CI under `TZ=UTC` and
  `TZ=Europe/Berlin` with the same results.
- A range boundary inside the spring gap can make two ranges overlap once converted (a close of 02:30 becomes 03:30,
  after the next range's 03:00 open): a slot whose start falls inside the previous slot is skipped, so no instant
  repeats.
- Earliest start across the boundary: at 2026-03-29 00:50 Berlin with prep 20 and a 24-hour config, the earliest slot is
  01:15; at 01:50 it is 03:15 (02:xx does not exist).
- `dayStatus` and the horizon use Berlin days, with a test at 23:30 and 00:30 Berlin time while the process runs in UTC.

### 6.4 Closed and full days
`GET /slots` never answers an empty list without saying why: `status` is `closed`, `past` or `too_far`, or `open` with
every slot carrying `bookable` and a `reason`. `POST /orders` answers the `SlotError` codes above (§12).

## 7. Pricing rules (`packages/core/src/pricing/`)

### 7.1 Input
`Cart = { lines: CartLine[] (1–30), promoCode?: string }`, `CartLine = { itemId, quantity (1–20), optionIds: string[] }`,
priced against the `Menu` (§7.6): items and combos with their groups, options and components, the promo codes and the
VAT rates. `itemCount` = Σ quantity (a combo counts as one item for slot capacity, §3).

### 7.2 Validation (`CartError`, with the line's index where one applies)
In this order: `empty_cart`, `too_many_lines`; then per line, in line order (every check of line 1 before any check of
line 2): `unknown_item`, `item_inactive`,
`options_on_combo` (a combo line with any option), `unknown_option` (not in one of the item's groups),
`duplicate_option` (the same option twice), `option_count` (a group's choices outside `[min, max]`),
`quantity_out_of_range`, `invalid_price` (a unit gross below 0 after deltas); then `promo_invalid` (a promo code that
is unknown or inactive; matching is trimmed and case-insensitive, and a code that is empty after trimming means no
code).

### 7.3 Amounts
1. **Unit gross** of a line = `price_cents` + the sum of the chosen options' `price_delta_cents`.
2. **Line gross** = unit gross × quantity. **Subtotal** = the sum of line gross amounts.
3. **Discount**: `percent` → `round(subtotal × value / 100)` (halves up); `fixed` → `min(value, subtotal)`. Never
   below 0, never above the subtotal. The discount is **spread over the lines in proportion to their line gross** by
   largest remainder: floor each share, then hand the leftover cents one by one to the largest fractional remainders,
   ties to the earlier line; if every weight is 0, the cents go round robin from the first line (`allocate(3, [0, 0])`
   → `[2, 1]`). A line's
   **discounted gross** = line gross − its share.
4. **Total** = subtotal − discount = the sum of discounted gross amounts.

### 7.4 VAT
- Rates by category, from the menu: `{ food: 7, drink: 19 }` in the seed (§3 VAT). An option delta takes its item's
  category.
- A **plain item line** has one part: its discounted gross at its category's rate.
- A **combo line** is split into parts before VAT: the discounted gross is allocated to the components in proportion to
  their standalone value (the component item's `price_cents` × the component's quantity; a component's `active` flag
  is ignored), by the largest-remainder rule of §7.3; parts of the same category are summed, so a combo yields at most
  one part per category, food before drink. A combo's own `vatCategory` is ignored (the seed stores `food`). A combo
  line with quantity 2 is split as one line, not per unit.
- **Per part**: `net = round(gross × 100 / (100 + rate))`, `vat = gross − net`, rounding to the nearest cent, halves
  up, in integer arithmetic (no floating point).
- The receipt's **VAT summary** has one line per rate present, ascending, each the sum of the parts at that rate
  (`{ rate, grossCents, netCents, vatCents }`), never recomputed from the totals, so `Σ gross = total` by construction.
  A part or summary line whose gross is 0 is kept (a fully discounted order still shows its rates). A combo that
  references a component missing from the menu is a fault of the menu, not of the cart: `priceCart` throws a plain
  `Error`, which the API answers as `internal`.

**Worked example** (a test): one Burger Menu at 12.90, no promo. Standalone values: burger 7.90, fries 3.50, Cola 2.90
(sum 14.30). Allocation: burger 1290 × 790 / 1430 = 712.66, fries 315.73, drink 261.61 → floors 712 + 315 + 261 = 1288,
two cents left → fries (.73) and burger (.66) → **713, 316, 261**. Parts: food 1029 → net 962, VAT 67; drink 261 →
net 219, VAT 42. Receipt: subtotal 1290, discount 0, total 1290, VAT 7 % 67 on 1029, VAT 19 % 42 on 261.

**With `HAHN10`**: discount 129, discounted gross 1161 → allocation 641.39 / 284.16 / 235.45 → floors 1160, one cent
to the drink (.45) → **641, 284, 236**; food 925 → net 864, VAT 61; drink 236 → net 198, VAT 38; total 1161.

### 7.5 Output
`Receipt { lines: PricedLine[], itemCount, subtotalCents, discountCents, promoCode?, totalCents, vat: VatLine[] }`,
`PricedLine { itemId, name, kind, optionNames, quantity, unitGrossCents, lineGrossCents, discountCents, parts: VatPart[] }`,
`VatPart { category, rate, grossCents, netCents, vatCents }`. The same function runs in the browser (instant totals)
and in the Worker (the amount that goes to Stripe).

### 7.6 API (`packages/core/src/pricing/index.ts`; schemas in `src/schemas/{menu,cart,receipt}.ts`)
- `Menu = { items: MenuItem[], promoCodes: PromoCode[], vatRates: { food, drink } }`;
  `MenuItem = { id, name, description?, priceCents, vatCategory, kind: "item" | "combo", sort, active, optionGroups,
  components }` (groups only on items, components only on combos, enforced by the schema);
  `OptionGroup = { id, name, minChoices, maxChoices, options: Option[] }` (`min ≤ max ≤ options.length`);
  `Option = { id, name, priceDeltaCents }`; `ComboComponent = { itemId, quantity }`;
  `PromoCode = { code (upper case, 2–20 of A–Z 0–9), kind: "percent" | "fixed", value, active }`.
  Ids are slugs; the seed's are listed in §5.
- `priceCart(menu, cart): Receipt` — throws `CartError { code: CartErrorCode, lineIndex? }` (§7.2).
- `itemCount(cart): number`.
- `allocate(total, weights: number[]): number[]` — the largest-remainder split of §7.3, exported for direct tests.
- `splitVat(grossCents, rate): { netCents, vatCents }` — §7.4, exported for direct tests.

## 8. Order lifecycle (`packages/core/src/orders/`)

### 8.1 States
`held` (slot reserved, payment pending) → `paid` → `ready` → `picked_up`; `expired` (hold timed out) and `cancelled`.
The cart before an order exists lives only in the browser (the handoff's `draft`); nothing is stored until a slot is held.

### 8.2 Transitions
| From | To | Trigger | Side effects |
|---|---|---|---|
| — | `held` | `POST /orders` | price with `core`; `place_hold` (atomic); Stripe Checkout Session; store its id and URL. Stripe failure → `release_hold(cancelled, stripe_failed)` and `502 payment_unavailable`. |
| `held` | `paid` | webhook `checkout.session.completed` with `payment_status = paid` | `paid_at`, payment intent id; the pickup code becomes visible |
| `held` | `expired` | cron: `release_expired_holds()` | slot released; then `checkout.sessions.expire` per order that has a session, best-effort (§8.4) |
| `held` | `cancelled` | webhook `checkout.session.expired` while still held: a safety net for a cron that did not run (Stripe's own 30-minute expiry; normally the order is already `expired` and the event is a no-op) | slot released, reason `session_expired` |
| `expired` | `paid` | webhook `checkout.session.completed` for an expired order (the race in §8.3) | `reserve_for_paid`: slot reserved again |
| `expired` | `cancelled` | the same webhook when `reserve_for_paid` raises `slot_full` | `cancelled_at`, reason `refunded_slot_full` (a conditional update; no slot change, `expired` released the items already), **then** `refunds.create` on the payment intent (§9.3); still 200 to Stripe |
| `paid` | `ready` | staff board | `ready_at` |
| `paid`, `ready` | `picked_up` | `POST /staff/pickup` with the code | `picked_up_at` |

`canTransition(from, to)` in `core` is the single table the API and the SQL functions agree on; every DB update carries
`WHERE status = <from>`, and zero rows updated answers `409 invalid_transition` (or is a no-op for webhooks, which must
answer 200).

**Invariant** (tested in `test:db`): for every slot, `booked = Σ item_count` of its orders in `held`, `paid`, `ready`,
`picked_up`.

### 8.3 Orders API (`packages/core/src/orders/index.ts`; schemas in `src/schemas/orders.ts`)
- `ORDER_STATUSES` and `OrderStatusSchema`; `CANCEL_REASONS` = `stripe_failed`, `session_expired`, `refunded_slot_full`.
- `canTransition(from, to): boolean` and `nextStatuses(from): OrderStatus[]`, the table of §8.2 and nothing else.
- `pickupCode(bytes: Uint8Array): string` — 8 characters, each `bytes[i] % 32` into Crockford's alphabet
  `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I, L, O, U); exactly 8 bytes, else a `RangeError`. The API passes
  `crypto.getRandomValues(new Uint8Array(8))`, so core stays free of platform APIs.
- `normalizePickupCode(text): string | null` — what staff typed: trimmed, upper-cased, `I`/`L` → `1`, `O` → `0`,
  hyphens and spaces removed; `null` unless the result is 8 alphabet characters. `PickupCodeSchema` matches the
  canonical form.

### 8.4 Holds and Stripe's clock
Our hold is 10 minutes; Stripe's shortest session expiry is 30 minutes (§17). The sequence every minute:
1. `release_expired_holds()` moves expired holds to `expired` and frees their items (one SQL call).
2. For each returned order that has a `stripe_session_id`, `payments.expireSession(sessionId)`. A session that is
   already complete (or expired) throws; the error is logged and ignored, because its `checkout.session.completed`
   event is on its way. `runCron` answers `{ released, sessionsExpired }` (the holds released, the sessions Stripe
   accepted to expire).

The gap between 1 and 2 is the race: a customer who pays in it has an `expired` order and a successful payment. The
webhook handles it with `reserve_for_paid`; if the slot has filled up meanwhile, the payment is refunded and the order
`cancelled`. The customer's status page shows "Payment refunded: the slot filled up while you were paying". Rare,
explicit, tested with a fake Stripe.

## 9. Stripe (test mode only)

### 9.1 Checkout Session
`mode: payment`, one `line_item` per priced line (§7.5) with `quantity: 1` and `price_data: { currency: "eur",
unit_amount: lineGrossCents − discountCents, product_data: { name } }`, so the cents always match ours, also for
combos and discounts (the line items sum to `receipt.totalCents`). The name is the line's name with its option names
in parentheses, prefixed with the quantity when it is more than one: "Burger Menu", "Chicken Burger (large, garlic)",
"2 × Chicken Burger (large, garlic)", "3 × Cola 0.33 l". `client_reference_id` and `metadata.order_id` = the order id;
`expires_at` = `now` + 31 minutes in epoch seconds, floored to the second: Stripe's minimum is 30 minutes, measured
on its clock when the request arrives (§17), and the extra minute absorbs the round trip and clock skew (our hold is
10 minutes, §8.4, so the session's own expiry is only a safety net); `success_url` = `${WEB_ORIGIN}/orders/${id}?paid=1`, `cancel_url` =
`${WEB_ORIGIN}/orders/${id}`. The customer's name is not sent to Stripe. An answer without a `url` counts as a
failure. Any failure (network, a refused request, a total under Stripe's minimum of 0.50 €) →
`release_hold(cancelled, stripe_failed)` and `502 payment_unavailable` (§8.2).

### 9.2 Webhook `POST /webhooks/stripe`
1. Read the raw body (`c.req.text()`, no JSON parsing before verification) and the `Stripe-Signature` header; verify
   with `stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET, 300,
   Stripe.createSubtleCryptoProvider(), now.getTime())`: the Web Crypto provider, because Workers have no synchronous
   HMAC (§17), and `receivedAt` from the app's clock **in milliseconds** (the library divides it by 1000 itself; in
   seconds the age would be hugely negative and the check would never fire), so the 5-minute tolerance is checked
   against `now`, not the host's clock. A missing header, a bad or stale signature, a body that is not JSON → 400 `bad_signature`.
2. Reduce the event to the `StripeEvent` subset (§9.4): `id`, `type`, and from `data.object` the session id, the
   `payment_status`, the payment intent id (a string, or the `id` of an expanded object, else null) and `orderId` =
   `metadata.order_id` when it is a UUID, else null (`stripe_events.order_id` is a uuid column; anything else is an
   event for no order). An event that does not even have `id` and `type` → 400 `validation`.
3. `INSERT INTO stripe_events (id, type, order_id)`. Conflict → `200 { duplicate: true }`, nothing else.
4. Handle by type (the rules of §8.2; every step is a conditional update, so even a retry that slips through cannot
   double-pay):
   - `checkout.session.completed` with `payment_status = paid`: read the order. `held` → `transition(held → paid)`
     with the payment intent. `expired` → `reserve_for_paid`; on `slot_full` → `transition(expired → cancelled,
     refunded_slot_full)` **then** the refund (§9.3). `cancelled` with reason `refunded_slot_full` → the refund once
     more (idempotent; this is the retry after a refund that failed). `paid`, `ready`, `picked_up`, any other
     `cancelled`, no order id, an unknown order → nothing. A conditional update that matches no row (the status moved
     between the read and the update, e.g. the cron expired the hold meanwhile) → read the order again and apply the
     rule once more; a second miss → step 5. A `payment_status` other than `paid` → nothing (recorded). A paid
     session without a payment intent (Stripe always sends one in `payment` mode; a guard) pays the order all the
     same, with a null intent.
   - `checkout.session.expired` → `release_hold(cancelled, session_expired)`; `NULL` (already moved on) is fine.
   - any other type → nothing; recorded.
   Then `200 { received: true }`.
5. A failure in step 4 (a repository error, Stripe refusing the refund) deletes the event row and answers 500
   `internal`, so Stripe's retry is processed, not treated as a duplicate. If the deletion fails too, the answer is
   still 500, the error is logged and the event stays recorded, so Stripe's retry is answered as a duplicate (an
   operator's case: the order is still in its old status and the event id is in the table).

Secrets: `STRIPE_SECRET_KEY` (`sk_test_…`; the environment schema refuses any other prefix: test mode only) and
`STRIPE_WEBHOOK_SECRET` (`whsec_…`) as Worker secrets (`wrangler secret put`), locally in the git-ignored `.dev.vars`.
Local webhooks: `stripe listen --forward-to localhost:8787/webhooks/stripe` (its own `whsec_`).

### 9.3 Refunds
Only the one case in §8.2: `stripe.refunds.create({ payment_intent }, { idempotencyKey: "refund:<order id>" })` for
a paid order whose slot could not be reserved again. The order is marked `cancelled` first, the refund follows: if the
refund fails, the webhook answers 500, Stripe retries, and the handler refunds a `cancelled`/`refunded_slot_full`
order again; the idempotency key makes Stripe answer with the same refund instead of a second one. (The other
order, refund first, could pay an order whose money is already back: a retry after a failed cancel would find the
slot free and `reserve_for_paid` would succeed.) No refund UI.

### 9.4 API (`apps/api/src/payments/`)
`Payments` (`types.ts`) is the only way routes and the cron reach Stripe; `AppDeps.payments` (§10.3) is required.
Two implementations: `createStripePayments(stripe, webhookSecret)` (`stripe.ts`) over the `stripe` package, and
`createFakePayments(options?)` (`fake.ts`) for the route tests and the web app's own tests.

```ts
interface Payments {
  /** §9.1: the Checkout Session for a held order. Throws PaymentsError when Stripe fails. */
  createCheckout(order: Order, urls: CheckoutUrls, now: Date): Promise<CheckoutSession>;
  /** §8.4 step 2. Throws PaymentsError when Stripe refuses (the session is complete or already expired). */
  expireSession(sessionId: string): Promise<void>;
  /** §9.3, idempotent per order. Throws PaymentsError. */
  refund(paymentIntentId: string, orderId: string): Promise<void>;
  /** §9.2 steps 1–2. Throws BadSignatureError; `signature` is the header, null when absent. */
  verifyWebhook(rawBody: string, signature: string | null, now: Date): Promise<StripeEvent>;
}
type CheckoutUrls = { success: string; cancel: string };
type CheckoutSession = { sessionId: string; url: string };
type StripeEvent = {
  id: string;
  type: string;
  sessionId: string | null;
  paymentStatus: string | null;
  paymentIntentId: string | null;
  orderId: string | null;
};
```

- `PaymentsError` (any Stripe failure, the cause attached) and `BadSignatureError` are classes in `types.ts`.
  `toApiError` maps `BadSignatureError` → 400 `bad_signature`; a `PaymentsError` that reaches a route is 500
  `internal` (the order route catches its own and answers 502, §8.2).
- `stripeEventFromRaw(raw: unknown): StripeEvent` (`types.ts`) is the pure reduction of §9.2 step 2: a Zod schema
  of the subset, every other field ignored; `id` and `type` are required.
- `checkoutSessionParams(order, urls, now): Stripe.Checkout.SessionCreateParams` (`stripe.ts`) is the pure mapping
  of §9.1, exported so the tests pin it without a network and the fake records exactly what Stripe would receive.
- `createStripePayments(stripe: StripeClient, webhookSecret)`: `StripeClient` is the structural subset of a `Stripe`
  instance the adapter uses (`checkout.sessions.create` and `.expire`, `refunds.create`,
  `webhooks.constructEventAsync`), so a test can pass a recording stub and production passes
  `new Stripe(STRIPE_SECRET_KEY)`. Every Stripe error becomes a `PaymentsError` with the original as `cause`.
- `createFakePayments({ webhookSecret = "whsec_test" }?)` answers a `FakePayments` = `Payments` plus:
  - `calls`: `{ createCheckout: { orderId, params }[], expireSession: string[], refund: { paymentIntentId, orderId }[]
    }`, every call recorded in order, `params` from `checkoutSessionParams`;
  - sessions `cs_test_1`, `cs_test_2`, … numbered by successful creations, each with the URL
    `https://checkout.stripe.com/c/pay/<id>`;
  - `fail(method, on = true)`: while on, `createCheckout`, `expireSession` or `refund` throws a `PaymentsError`
    (the call is still recorded);
  - `signedEvent(raw, now)`: `{ body, signature }` for a Stripe-shaped event (`raw` is what Stripe would send:
    `{ id, type, data: { object: { … } } }`), signed with `stripe.webhooks.generateTestHeaderString({ payload,
    secret, timestamp: now in seconds })`;
  - `verifyWebhook` is the real verification (the same function as the Stripe adapter, on an offline `Stripe`
    instance with the fake's secret), so the route tests cover signatures, the tolerance and the subset mapping.

### 9.5 Decisions made while building M5
- `reserve_for_paid` raising `invalid_status` is a miss of §9.2 step 4 (its conditional update matched no row: the
  order is no longer `expired`), as is a `null` from `transition(expired → cancelled)`: the order is read again and
  the rule applied once more; two attempts in all, then step 5.
- A refund that is due for a session without a payment intent (impossible in `payment` mode; a guard): the order is
  still `cancelled` with `refunded_slot_full`, the refund is skipped with an error in the log naming the order (an
  operator's case), the answer is 200. On the retry path (`cancelled`/`refunded_slot_full`) the refund uses the
  event's payment intent, because the order's own column stays null after a rolled-back `reserve_for_paid`.
- One `now` per webhook request, read before the body: the signature's tolerance and every timestamp use it.
- An event without a usable `orderId` is recorded and nothing else, whatever its type; `checkout.session.expired`
  for an unknown id goes through `release_hold`, which answers `NULL`. Nothing looks an order up by session id.
- Only a `PaymentsError` from `createCheckout` releases the hold with `stripe_failed`; any other throw (and a
  failing `setCheckout`) is a 500 that leaves the hold to the cron. If `releaseHold` fails too, 500.
- A session answered with `url: ""` counts as one without a URL (a `PaymentsError`).
- `Stripe.createSubtleCryptoProvider()` is created per verification, so nothing touches `crypto.subtle` at the
  Worker's start.
- The webhook does not call `canTransition`: it switches on the status it has just read, and the only transitions
  it takes (`held → paid`, `expired → cancelled`) are in the table of §8.2.
- Logs carry messages only: the cron names the Stripe call that failed ("Stripe checkout.sessions.expire failed"),
  not Stripe's reason; a `PaymentsError` reaching `onError` (a failed refund) is logged with its `cause` (a Stripe
  error object: response metadata, never the key); no body, header, key or secret is logged or returned.
- The fake is not part of the Worker bundle (`wrangler deploy --dry-run` checked); the bundle carries the Web build
  (`WebPlatformFunctions`, `FetchHttpClient`, `SubtleCryptoProvider`).

## 10. API (`apps/api`)

JSON everywhere; every request and response shape is a Zod schema in `packages/core/src/schemas/api.ts` (§10.1). Errors
are `{ error: { code, message, lineIndex?, issues? } }` (§12). CORS allows `WEB_ORIGIN` and `http://localhost:3000`.
`now` comes from the app's dependencies, never from the clock inside a route (§10.3).

| Method, path | Request | Response |
|---|---|---|
| `GET /health` | — | `{ ok: true }` |
| `GET /menu` | — | `PublicMenu`: the `Menu` without its promo codes (customers never see the code list; the browser prices with `promoCodes: []` and asks `POST /quotes` for a code). |
| `GET /slots?date=YYYY-MM-DD&items=1` | `SlotsQuery` | `SlotsResponse { date, status, slots }` (§6.2 `listSlots` for `items`). Before listing, the API calls `releaseExpiredHolds(now)` so availability is fresh between cron runs. |
| `POST /quotes` | `Cart` | `Receipt` (pure, nothing stored) |
| `POST /orders` | `CreateOrderRequest` = `Cart & { slotStart, customerName }` | `201 CreateOrderResponse { order: OrderSummary, checkoutUrl }`; `checkoutUrl` is the Checkout Session's URL (§9.1), repeated inside `order` while held |
| `GET /orders/:id` | — | `OrderSummary` |
| `POST /webhooks/stripe` | the raw JSON body and the `Stripe-Signature` header (§9.2) | `WebhookResponse`: `{ received: true }` or `{ duplicate: true }`; 400 `bad_signature`; 500 after a failed handling (the event row removed) |
| `GET /staff/orders?date=` | token; `date` defaults to today | `StaffBoard { date, status, slots: StaffSlot[] }`: every grid slot of the day with `booked`/`capacity` (0 and the configured capacity for a slot without a row) and its orders in `paid`, `ready`, `picked_up` (held orders count in `booked` only) |
| `POST /staff/orders/:id/ready` | token | `StaffOrder` (`paid → ready`) |
| `POST /staff/pickup` | token, `PickupRequest { code }` | `StaffOrder` (`paid` or `ready` → `picked_up`); the code is normalised first (§8.3) |

`POST /orders`, in order: validate the body; `getMenu`, `priceCart` (`CartError` → 400 with its code and `lineIndex`);
`getSettings`; `getSlotUsage` for the slot; `checkSlot(config, slotStart, itemCount, now, booked)` (§6.2, a `SlotError`
→ 409); a pickup code from 8 random bytes; `placeHold(order, capacityPerSlot, holdExpiry(config, now))`
(`SlotFullError` → 409 `slot_full`); then `payments.createCheckout(order, urls, now)` (§9.1) and `setCheckout(id,
sessionId, url)`; a `PaymentsError` → `releaseHold(id, cancelled, stripe_failed, now)` and 502 `payment_unavailable`
(a hold whose session was created but whose `setCheckout` failed stays held without a URL; the cron releases it,
§8.4). The body's own totals, if any, are ignored: the server prices.

The Worker also exports `scheduled()` for the Cron Trigger (`* * * * *`): `runCron(deps)` releases the expired holds
and expires their Checkout Sessions (§8.4) and returns `{ released, sessionsExpired }`.

### 10.1 Schemas (`packages/core/src/schemas/api.ts`)
- Instants in JSON are ISO 8601 strings with an offset (`z.iso.datetime({ offset: true })`), always UTC (`…Z`) in
  responses; a day is a `DayString`.
- `PublicMenu` = `Menu` without `promoCodes`. `SlotsQuery = { date, items? (1–100, default 1) }`.
  `SlotAvailabilityDto = { start, label, available, bookable, reason? }`. `SlotsResponse = { date, status, slots }`.
- `CreateOrderRequest = Cart & { slotStart, customerName (trimmed, 1–60) }`. `CreateOrderResponse = { order, checkoutUrl: string | null }`.
- `OrderSummary = { id, status, slotStart, slotLabel, customerName, itemCount, receipt, createdAt, pickupCode?,
  checkoutUrl?, holdExpiresAt?, cancelReason?, paidAt?, readyAt?, pickedUpAt?, expiredAt?, cancelledAt? }`:
  `pickupCode` only in `paid`, `ready`, `picked_up`; `checkoutUrl` (the session's URL, `null` until `setCheckout`
  stored one) and `holdExpiresAt` only in `held`; `cancelReason` only in `cancelled`; each timestamp only once it
  exists.
- `WebhookResponse = { received: true } | { duplicate: true }` (§9.2).
- `StaffOrder = { id, status, pickupCode, customerName, slotStart, slotLabel, lines, itemCount, totalCents, paidAt,
  readyAt?, pickedUpAt? }`. `StaffSlot = { start, label, booked, capacity, orders }`. `StaffBoard = { date, status, slots }`.
  `StaffQuery = { date? }`. `PickupRequest = { code (1–20 chars) }`.
- `ApiError = { error: { code: ApiErrorCode, message, lineIndex?, issues? } }`; `ApiErrorCode` is the union of §12.
- `slotLabel(config, start)` in core gives `slotLabel` (§6.2's label for any grid instant).

### 10.2 Repository (`apps/api/src/repo/types.ts`)
The only way routes reach the database. One interface, two implementations: `createSupabaseRepository(client)`
(`src/repo/supabase.ts`, the service-role `supabase-js` client, rows mapped by `src/db/rows.ts`) and
`createMemoryRepository({ settings, menu })` (`src/repo/memory.ts`, used by the route tests and the web app's own
tests). **One contract test runs against both** (`test/repo/contract.ts`: in `pnpm test` against the memory one, in
`pnpm test:db` against the Supabase one), so the fake cannot drift from the database.

`Order` is the domain shape (camelCase, `Date`s, `null` for absent): `{ id, status, slotStart, customerName, lines,
receipt, itemCount, totalCents, promoCode, pickupCode, stripeSessionId, checkoutUrl, stripePaymentIntentId,
holdExpiresAt, cancelReason, createdAt, paidAt, readyAt, pickedUpAt, expiredAt, cancelledAt }`. `NewOrder` is what `placeHold` takes
(`slotStart, customerName, lines, receipt, itemCount, totalCents, promoCode, pickupCode`).

| Method | Semantics (the SQL of §5 behind it) |
|---|---|
| `getSettings(): SlotConfig` | the `settings` row, mapped |
| `getMenu(): Menu` | items, groups, options, components, promo codes, `VAT_RATES_DE_2026` |
| `getSlotUsage(from, to): Booked` | the `slots` rows with `from ≤ starts_at < to`, keyed by instant ms |
| `placeHold(order, capacity, holdExpiresAt): Order` | `place_hold`; throws `SlotFullError` |
| `getOrder(id): Order \| null` | by id. `createdAt` is the database's own time (`now()` in `place_hold`), the one timestamp not taken from the app's clock |
| `findOrderByPickupCode(code): Order \| null` | by the canonical code |
| `listOrders(from, to): Order[]` | `from ≤ slot_start < to`, any status, by `slot_start` then `created_at` |
| `transition(id, from, to, at, patch?): Order \| null` | the conditional `UPDATE … WHERE status IN from` setting `status = to` and the matching `*_at = at` (`paid_at`, `ready_at`, `picked_up_at`, `cancelled_at`), plus `patch.stripePaymentIntentId` and `patch.cancelReason` when given; `null` when no row matched (unknown id or another status). Only for `held → paid`, `paid → ready`, `paid \| ready → picked_up`, and `expired → cancelled` with `cancelReason` (§8.2: the refund case; no slot change); the caller checks `canTransition` first. |
| `releaseHold(id, status, reason, now): Order \| null` | `release_hold`; `null` when nothing was released (an all-null row from PostgREST is `null`) |
| `releaseExpiredHolds(now): Order[]` | `release_expired_holds` |
| `reserveForPaid(id, capacity, paymentIntentId, now): Order` | `reserve_for_paid`; `paymentIntentId` may be `null` (a completed session without one, §9.2); throws `SlotFullError` or `InvalidStatusError` |
| `setCheckout(id, sessionId, checkoutUrl): void` | `stripe_session_id` and `checkout_url` on the order (any status: the session exists once Stripe answered) |
| `recordStripeEvent(id, type, orderId): boolean` | `INSERT`; `false` on a duplicate id |
| `deleteStripeEvent(id): void` | after a failed handling (§9.2 step 5) |

`SlotFullError` and `InvalidStatusError` are classes in `types.ts`; the Supabase implementation maps PostgREST's
`P0001` with message `slot_full` / `invalid_status` to them and rethrows anything else.

### 10.3 The app and its dependencies (`apps/api/src/app.ts`)
`createApp(deps: AppDeps): Hono` with `AppDeps = { repo: Repository; now: () => Date; staffToken: string; webOrigin:
string; randomBytes: (n: number) => Uint8Array; payments: Payments }`. `src/index.ts` builds them from the Worker
environment (validated by Zod in `src/env.ts`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_TOKEN`,
`WEB_ORIGIN`, `STRIPE_SECRET_KEY` starting with `sk_test_`, `STRIPE_WEBHOOK_SECRET` starting with `whsec_`) with
`new Date()`, `crypto.getRandomValues` and `createStripePayments(new Stripe(STRIPE_SECRET_KEY),
STRIPE_WEBHOOK_SECRET)`. Tests build them with the memory repository, the fake payments, a fixed `now` and
deterministic bytes. `runCron(deps)` is the cron's body.

### 10.4 Decisions made while building M4
- A `date` that matches `YYYY-MM-DD` but is not a calendar day (`2026-02-30`) → 400 `validation` on `/slots` and
  `/staff/orders` (core would throw a `RangeError` otherwise).
- `GET /slots` releases expired holds only for an `open` day (the other statuses list nothing); the staff board does
  not release holds, the cron does.
- In M4 `setCheckout` stored only the session id and a held order's `checkoutUrl` was `null`; M5 added the column
  (`orders.checkout_url`) and the URL in the summary.
- An `InvalidStatusError` that reaches a route is 500 `internal` (§12 has no code for it); the M5 webhook handles it
  itself.
- Invalid Worker environment variables → 500 `internal`; the log names the variables, never their values.

### 10.5 Staff authentication
`Authorization: Bearer <STAFF_TOKEN>` on every `/staff/*` request, compared in constant time; anything else → 401
`unauthorized`. CORS preflights (`OPTIONS`) carry no token by design of browsers, so they pass before the check. A
deliberate simplification (§2, §16).

## 11. Web (`apps/web`)

Next.js App Router, Tailwind, mobile-first, English. Client components where state lives; no server actions (the API is
the only backend, as in the restaurant's own setup where the app and the portal share one API).

| Route | Screen |
|---|---|
| `/` | **Menu.** Items by section (Chicken, Sides, Drinks, Menus); tapping an item with options opens a sheet with its groups (radio for `max 1`, checkboxes otherwise, the min/max enforced before Add). Cart bar with the total, priced locally with `core`. The cart lives in `localStorage`. |
| `/checkout` | **Slot and pay.** Name; a day strip (today + 6, closed days greyed with "Closed"); the day's slots from `GET /slots` as chips (non-bookable ones disabled with their reason on tap); promo code field (applied via `POST /quotes`); the receipt with VAT lines; **Pay** → `POST /orders` → redirect to `checkoutUrl`. Slot errors from the API are shown inline and the slot list refreshes. |
| `/orders/[id]` | **Status.** Polls `GET /orders/:id` every 3 s while `held`. `paid`: the QR code (SVG of the staff pickup URL), the pickup code in letters, slot time, the receipt. `ready`: a "Ready, come and get it" banner. `picked_up`: "Enjoy your meal". `expired`: "Your slot hold ran out; start again". `cancelled`: the reason in words. |
| `/staff` | **Board.** Asks for the staff token once (kept in `localStorage`). Today's slots as sections with `booked/capacity`; each order a card: code, name, items with options, status, buttons **Ready** and **Picked up**. Refreshes every 10 s. A date picker for other days. |
| `/staff/pickup?code=` | **Check-in.** The QR code's target. With the token: calls `POST /staff/pickup` and shows the order and "Picked up ✓", or the error. Without: asks for the token first. |

No design system beyond Tailwind defaults and one accent colour. No dark mode work.

## 12. Errors

| Code | HTTP | Where |
|---|---|---|
| `validation` | 400 | any body, path or query that fails its Zod schema (`issues` carries Zod's) |
| `unknown_item`, `item_inactive`, `options_on_combo`, `unknown_option`, `duplicate_option`, `option_count`, `invalid_price` | 400 | `POST /quotes`, `POST /orders` (`empty_cart`, `too_many_lines` and `quantity_out_of_range` exist in `core` but never reach the API: the `Cart` schema refuses those bodies first, as `validation`) |
| `promo_invalid` | 400 | same (`CartError`s carry `lineIndex` where one line is at fault) |
| `closed_day`, `too_far`, `slot_not_on_grid`, `slot_past_cutoff`, `slot_too_soon`, `too_many_items` | 409 | `POST /orders` |
| `slot_full` | 409 | `POST /orders` (from `place_hold`) |
| `payment_unavailable` | 502 | Stripe failed while creating the session; the hold is released |
| `order_not_found` | 404 | `GET /orders/:id`, staff routes |
| `invalid_transition` | 409 | staff routes (e.g. Ready on a `held` order, Picked up on a code whose order is not `paid` or `ready`) |
| `invalid_code` | 404 | `POST /staff/pickup`: no order has that code, or the text cannot be a code |
| `unauthorized` | 401 | `/staff/*` without or with a wrong token |
| `bad_signature` | 400 | webhook |
| `not_found` | 404 | an unknown route (JSON, like every other error) |
| `internal` | 500 | anything else; the message never leaks internals |

## 13. Testing

| Layer | What | How |
|---|---|---|
| Unit, `core` | **Slots:** the grid for each weekday of the seed, a day with two ranges, "24:00", the 44/92/100 DST counts and labels, the non-existent and ambiguous opening times, earliest start (exact grid point, mid-slot, across the DST gap), cut-off with a config where it matters (prep 0, cut-off 10), horizon edges in Berlin time with the process in UTC, `dayStatus` for every value, `listSlots` reasons, `checkSlot` error order, `holdExpiry`. **Pricing:** every `CartError`, deltas (0, positive, negative), min/max groups, the worked example of §7.4, VAT rounding on a table of hand-computed cases (e.g. 1 cent, 100, 1000, 1999 at 7 and 19), percent and fixed promos, the largest-remainder spread (a 10 % discount over 1500/500, 5 % over 333/333/334), a fixed promo larger than the subtotal, the VAT summary summing to the total for random carts (a property test with a seeded generator), combo parts (one per rate, sums equal the discounted line gross), `priceCart` deterministic, `itemCount`, `splitVat` and `allocate` directly. **Orders:** `canTransition` over the whole table, pickup codes (8 Crockford chars, no ambiguous letters, 10 000 draws unique). **Schemas:** every API shape round-trips its example. | Vitest in `packages/core`; `now` fixed per test; no network |
| API | Every route with `app.request()` against the in-memory repository and a fake `Payments`: happy paths, each error code, `GET /slots` releasing expired holds first, `POST /orders` pricing server-side (a tampered total is ignored), `pickupCode` hidden while held, staff token (missing, wrong, right), ready/pickup transitions, the webhook: a real signature built with `stripe.webhooks.generateTestHeaderString` and a test secret, a bad signature, `completed` → paid, the same event twice → one paid order and one event row, `expired` → cancelled only when held, an unknown order → 200, a processing failure removing the event row, the `expired`-then-paid race (re-reserve ok; slot full → cancelled + refund), and the cron handler (release, then expire sessions, a completed session's error ignored). **Payments:** the Stripe adapter over a recording stub (`checkoutSessionParams` against §9.1, an answer without a URL, `expireSession`, `refund` with its idempotency key, `verifyWebhook` with real signatures) and the fake (recording, `fail`, `signedEvent` round trip). | Vitest in `apps/api`, `app.request()`, fakes; no network |
| Database | `pnpm test:db` against local Supabase: migrations and seed apply from scratch (`supabase db reset` in `globalSetup`); the seed maps to the `core` fixtures `seedMenu` and `seedConfig` exactly; `reserve_slot` with capacity 1: **50 parallel calls → exactly 1 success, 49 `slot_full`**, `booked = 1`, both through the `postgres` driver (50 connections) and through `supabase-js` as production calls it; capacity 20 with 50 callers → 20 winners; an existing row keeps its capacity; `invalid_items`; `place_hold` returns the held order and rolls the reservation back when the insert fails; `release_hold` once and again (`NULL`, no double release), `invalid_status`; `release_expired_holds(p_now)` releases only the expired holds; `reserve_for_paid` ok and `slot_full`, only from `expired`; `slot_booked_mismatches()` empty after every scenario; the CHECKs on `orders.status` and `slots.booked`, the `stripe_events` primary key; RLS: with the anon key every table reads as empty and every function is refused. | Vitest in `apps/api` (`test/db/*.test.ts`, `vitest.db.config.ts`), `postgres` for the parallel calls and assertions, `supabase-js` for the PostgREST path; files run one at a time; CI runs it with the Supabase CLI (§14) |
| Manual | The phone flow with the test card `4242 4242 4242 4242`, the QR scan from a second phone, the staff board | Before each milestone's review, and against production after each deploy |

Test-first: a milestone's tests are written and reviewed before the implementation (`docs/plan.md`).

## 14. CI/CD and deployment

### Checks (every push and pull request)
`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm check` (Biome), `pnpm test`, then `pnpm test:db` with the
Supabase CLI: `supabase/setup-cli`, then `supabase start -x studio,imgproxy,inbucket,mailpit,edge-runtime,logflare,vector,supavisor,realtime,storage-api`
(Postgres, PostgREST and the gateway only). Measured in M0 on `ubuntu-24.04`: 1 min 35 s including the image pulls, so
no `postgres:17` service container is needed.

### Deploys (push to `main`, after the checks)
1. `supabase db push --remote` with `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`: migrations
   only (CLI 3: without `--remote` the command targets the local database). The seed (plain inserts, not idempotent)
   was applied **once**, by hand, with `supabase db push --remote --include-seed` when the project was created
   (2026-11-07); menu changes after that are migrations. A migration is always run locally first
   (`supabase db reset`) and reviewed before it is pushed.
2. `wrangler deploy` in `apps/api` with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (secrets live in Cloudflare, set
   once by hand with `wrangler secret put`).
3. `opennextjs-cloudflare build && opennextjs-cloudflare deploy` in `apps/web` (from M6).

Markdown-only changes skip CI (`paths-ignore`).

### Where it runs
- **API:** Worker `slot-order-api` at `https://slot-order-api.antonsplavnik.workers.dev` (live since 2026-11-07), Cron
  Trigger every minute, no `nodejs_compat`: `stripe` 23 ships a Web build that wrangler selects through the
  `workerd` export condition, with the fetch client and Web Crypto as its defaults (verified in M5, §17). M0 note:
  with `compatibility_date = 2026-11-06`, wrangler 4.158 reports Node.js compatibility as already enabled without the
  flag; `@types/node` is in `apps/api` (the `stripe` package's peer dependency).
- **Web:** Worker `slot-order-web` via OpenNext, `*.workers.dev`.
- **Database:** the Supabase free-tier project `slot-order` (ref `ckvngajrwdijdtjvfblm`) in `eu-central-1` (Frankfurt),
  created 2026-11-07. The service-role key exists only as a Worker secret and in the Mac's git-ignored `.env`
  (`SUPABASE_SERVICE_ROLE_KEY_CLOUD`, beside the database password and the project ref).
- **Stripe:** a test-mode webhook endpoint pointing at the Worker; the signing secret stored with `wrangler secret put`.

## 15. Development setup

Prerequisites: Node 24+, pnpm 11 (pinned in `packageManager`), Docker (for `supabase start`), the Supabase CLI
(`brew install supabase/tap/supabase`), the Stripe CLI (`brew install stripe/stripe-cli/stripe`, for `stripe listen`).
`wrangler` is a devDependency.

```sh
pnpm install
supabase start                      # local Postgres + PostgREST (Docker); prints the local keys
cp apps/api/.dev.vars.example apps/api/.dev.vars    # local secrets: Supabase local keys, Stripe test keys, STAFF_TOKEN
cp apps/web/.env.example apps/web/.env.local        # NEXT_PUBLIC_API_URL
supabase db reset                   # migrations + seed
pnpm dev                            # wrangler dev on :8787 and next dev on :3000
stripe listen --forward-to localhost:8787/webhooks/stripe   # in another terminal; put its secret in .dev.vars
pnpm test · pnpm test:db · pnpm typecheck · pnpm check · pnpm format
```

`HANDOFF.md` (the private brief) and `MESSAGE.md` (the note that goes with the repo link) sit in the repo root and are
git-ignored; nothing in the committed repo names the company this was written for.

## 16. Later

- **POS adapter (M7):** `PosAdapter { pushPaidOrder(order): Promise<void> }` called after `paid`, with a mock that logs
  to a `pos_log` table shown on the staff board. Only after M6 is reviewed and time is left.
- Customer accounts and order history; real staff accounts (Supabase Auth with RLS policies).
- Eat-in orders (would need per-order VAT treatment only if the law changes again), delivery.
- Menu and opening-hours administration; per-slot capacity overrides; holidays.
- Refund UI; order edits; a customer "cancel while held" button.
- Rate limiting on `POST /orders`; observability beyond Workers logs.
- German UI; receipts by email.

## 17. Research notes

- **German VAT for restaurants, 2026.** The reduced rate of 7 % applies permanently to food served in restaurants since
  2026-01-01 (Steueränderungsgesetz 2025, passed by the Bundesrat on 2025-12-19); takeaway food was already 7 %; drinks
  stay at 19 % (with narrow exceptions such as milk, which this menu does not have). The original brief's rule "eaten in
  19 %" described 2024–2025. Sources: [IHK Schwerin](https://www.ihk.de/schwerin/standort-westmecklenburg/tourismus-und-gastgewerbe/rechtsfragen/steuersaetze-in-gastronomie-und-hotellerie-4835520),
  [Grant Thornton](https://www.grantthornton.de/themen/2025/gastronomie-ab-2026-7-prozent-fuer-speisen-19-prozent-fuer-getraenke/),
  [IHK Darmstadt](https://www.ihk.de/darmstadt/produktmarken/beraten-und-informieren/branchen/tourismus-in-suedhessen/informationen-fuer-gastronomie-und-hotellerie/reduzierter-mehrwertsteuersatz-6933470),
  [für-gründer.de](https://www.fuer-gruender.de/blog/gastro-mehrwertsteuer-2026-das-gilt-ab-1-januar/).
- **Stripe Checkout expiry.** `expires_at` must be between 30 minutes and 24 hours after creation; a session can be
  ended early with the expire endpoint, which fires `checkout.session.expired`; only an open session can be expired
  (an error otherwise). Stripe measures the minimum on its own clock when the request arrives, so exactly 30 minutes
  from the caller's clock is refused now and then; §9.1 sends 31 minutes. Sources:
  [Stripe, Manage limited inventory](https://docs.stripe.com/payments/checkout/managing-limited-inventory),
  [Stripe, expire a session](https://docs.stripe.com/api/checkout/sessions/expire?lang=node).
- **Next.js on Cloudflare.** `@opennextjs/cloudflare` 1.20.x supports Next.js 16 (peer `16.3.x`) and 15.5; build with
  `opennextjs-cloudflare build`, deploy with `wrangler`; needs `nodejs_compat`. Sources:
  [release 1.20.3](https://github.com/opennextjs/opennextjs-cloudflare/releases/tag/@opennextjs%2Fcloudflare@1.20.3),
  [Vercel's comparison](https://vercel.com/kb/guide/next-js-on-vercel-vs-cloudflare.md).
- **Supabase CLI in CI.** The CLI reference lists `supabase db start` beside `supabase start` as a way to start the local
  stack, and `supabase start -x <containers>` excludes services. Which one CI uses is settled in M0. Source:
  [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-start).
- **`stripe` on Workers** (verified 2026-11-07 against `stripe` 23.1.0, released 2026-10-29, in `node_modules`). The
  package's `exports` map has `workerd`, `worker`, `browser`, `bun` and `deno` conditions pointing at
  `esm/stripe.esm.worker.js`, which initialises the client with `WebPlatformFunctions`: `createDefaultHttpClient()` is
  the fetch client and `createDefaultCryptoProvider()` the SubtleCrypto one, so `new Stripe(key)` needs neither
  `Stripe.createFetchHttpClient()` nor an `httpClient` option, and `constructEventAsync` verifies with Web Crypto by
  default; the Node-only files (`NodeHttpClient`, `NodeCryptoProvider`, `NodePlatformFunctions`) are reached only
  from the Node entry. Wrangler bundles with the conditions `workerd, worker, browser`, so the Worker gets that build
  and `nodejs_compat` is not needed. The synchronous `constructEvent` cannot work with SubtleCrypto (async only), hence
  `constructEventAsync(payload, header, secret, tolerance?, cryptoProvider?, receivedAt?)`; the code passes
  `Stripe.createSubtleCryptoProvider()` and `receivedAt` explicitly so Vitest (Node build, Node 24's
  `globalThis.crypto.subtle`) runs the same path as production. `receivedAt` is in **milliseconds**:
  `validateComputedSignature` computes `Math.floor(receivedAt / 1000) - t` (`esm/Webhooks.js`), found by the M5 test
  agent after the draft spec said seconds. `generateTestHeaderString({ payload, secret,
  timestamp?, scheme?, signature?, cryptoProvider? })` returns `t=…,v1=…`; the default tolerance is 300 s.
  `checkout.sessions.create(params)` answers a `Session` with `id`, `url`, `payment_intent` (`string | PaymentIntent |
  null`), `payment_status` (`paid | unpaid | no_payment_required`), `metadata`, `client_reference_id`;
  `checkout.sessions.expire(id)`; `refunds.create({ payment_intent }, { idempotencyKey })`. `StripeConfig.apiVersion`
  is optional (the account's default version). The Checkout events `checkout.session.completed` and
  `checkout.session.expired` carry a `Checkout.Session` in `data.object`. Sources: the package's `package.json`,
  `esm/stripe.esm.worker.js`, `esm/platform/*.js`, `esm/Webhooks.d.ts`, `esm/resources/Checkout/Sessions.d.ts`,
  `esm/resources/Refunds.d.ts`, `esm/resources/Events.d.ts`; [Cloudflare, Stripe support in
  Workers](https://blog.cloudflare.com/announcing-stripe-support-in-workers) (2021: why the fetch client exists);
  [Hono, Stripe webhook example](https://hono.dev/examples/stripe-webhook).
