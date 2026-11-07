# M4 brief: the API test suite (tests first)

You write the **tests** for the Hono API (`apps/api`): the routes of §10 against the in-memory repository, and the
repository contract that both repository implementations must satisfy. Nothing of M4 is implemented: `src/app.ts`
has `createApp(deps)` with only `GET /health` and a `runCron` stub; `src/repo/memory.ts` and `src/repo/supabase.ts`
are stubs that throw. Your tests are the specification the implementer must satisfy: precise, readable, **red**.

## Read first
- `docs/design.md` **§10 in full** (the table, §10.1 schemas, §10.2 repository, §10.3 deps, §10.4 staff auth), §12
  (codes and HTTP statuses), §8.2–§8.3, §6.2 (what `listSlots`/`checkSlot` answer), §13 row "API".
- `packages/core/src/schemas/api.ts` (every response is validated with these schemas in your tests),
  `apps/api/src/repo/types.ts` (the contract), `apps/api/src/app.ts` (`AppDeps`, `createApp`, `runCron`).
- Core fixtures: `packages/core/test/fixtures/menu.ts` (`seedMenu`, `line`), `slotConfigs.ts` (`seedConfig`); core's
  `priceCart`, `slotGrid`, `holdExpiry` to compute expectations instead of hard-coding where that reads better.
- `apps/api/test/db/helpers.ts` (the local-stack clients and `resetOrders`, for the database variant of the contract).

## You own
- `apps/api/test/helpers/app.ts`: `makeDeps(overrides?)` → `AppDeps` with `createMemoryRepository({ settings:
  seedConfig, menu: seedMenu })`, a **settable clock** (`clock.set(iso)`, default `2026-11-09T11:00:00Z`, Monday 12:00
  Berlin), `staffToken: "staff-secret"`, `webOrigin: "https://web.example"`, and `randomBytes` from a counter so pickup
  codes are deterministic and distinct (`Uint8Array` of 8 bytes; the code is `bytes[i] % 32` into Crockford's
  alphabet, core's `pickupCode`); `request(app, method, path, { body?, token?, headers? })` returning
  `{ status, json, headers }`; `expectError(res, status, code)`.
- `apps/api/test/routes/health.test.ts` (move the existing `test/health.test.ts` there and delete the old file),
  `menu.test.ts`, `slots.test.ts`, `quotes.test.ts`, `orders.test.ts`, `staff.test.ts`, `cors.test.ts`,
  `errors.test.ts`, `cron.test.ts`.
- `apps/api/test/repo/contract.ts`: `describeRepositoryContract(name, open: () => Promise<Repository>)`, a `describe`
  block of tests every implementation must pass; `apps/api/test/repo/memory.test.ts` runs it on
  `createMemoryRepository`; `apps/api/test/db/repository.test.ts` runs it on `createSupabaseRepository(serviceClient)`
  with `resetOrders()` before each (this file runs under `pnpm test:db`, the others under `pnpm test`).

## You must not
- Touch `src/`, configs, `package.json`, the core package, or the existing db tests except as named. Commit.
- Use real time: every test sets or reads the clock helper. No network except the db variant against the local stack.

## Facts the tests must pin (seed config and menu; now = 2026-11-09T11:00:00Z unless noted; S = 2026-11-09T11:30:00Z, the 12:30 slot)
Menu: `GET /menu` → 200, parses with `PublicMenuSchema`, equals `seedMenu` without `promoCodes`, and has no
`promoCodes` key.

Slots: `GET /slots?date=2026-11-09` → 200, `SlotsResponseSchema`, `status "open"`, 44 slots in grid order, every
`start` an ISO string ending in `Z`; the 12:30 entry `{ start: S, label: "12:30", available: 20, bookable: true }`
(no `reason`); 11:00 `past`; 12:15 `too_soon`. `?date=2026-11-08` → `status "closed"`, `slots: []`; `?date=2026-11-16`
→ `too_far`, `[]`; `?date=2026-11-06` → `past`, `[]`. `?date=2026-11-09&items=3` after a hold of 18 items at S →
12:30 `full`, `available 2`; with `items=2` bookable. Missing `date`, `date=2026-1-9`, `items=0`, `items=101` → 400
`validation` with `issues`. Expired holds are released first: a held order whose hold expired (clock → 11:11Z) is
`expired` after the listing and 12:30 shows `available 20` again.

Quotes: `POST /quotes` `{ lines: [burger-menu ×1] }` → 200 equal to `priceCart(seedMenu, cart)`; with `promoCode
"HAHN10"` → `discountCents 129`; `"NOPE"` → 400 `promo_invalid`; an unknown item on line 2 → 400 `unknown_item` with
`lineIndex: 1`; `{}` → 400 `validation`; a non-JSON body → 400 `validation`.

Orders (`POST /orders` body `{ lines: [burger-menu ×1], slotStart: S, customerName: "Ada" }`):
- 201, `CreateOrderResponseSchema`; `checkoutUrl: null` at the top and `order.checkoutUrl: null`; `order.status
  "held"`, `holdExpiresAt "2026-11-09T11:10:00.000Z"`, no `pickupCode`, no `paidAt`, `slotStart` = S, `slotLabel
  "12:30"`, `customerName "Ada"`, `itemCount 1`, `receipt` = `priceCart(seedMenu, cart)`, `createdAt` = now, `id` a
  UUID. `GET /orders/:id` then answers the same summary. `GET /slots` shows 12:30 `available 19`.
- `customerName " "` and a 61-character name → 400 `validation`; missing `slotStart` → 400; a name `" Ada "` is stored
  trimmed as `"Ada"`.
- Slot errors, each 409 with its code: Sunday `2026-11-08T12:00:00Z` → `closed_day`; `2026-11-16T11:00:00Z` →
  `too_far`; `2026-11-09T11:37:00Z` → `slot_not_on_grid`; `2026-11-09T10:00:00Z` → `slot_past_cutoff`;
  `2026-11-09T11:15:00Z` → `slot_too_soon`; 21 items (cola ×20 and ayran ×1) → `too_many_items`; after a hold of
  cola ×20 at S, a 1-item order at S → `slot_full`.
- Cart errors → 400 with the code and `lineIndex`; `promo_invalid` → 400.
- The server prices: a body that also carries `receipt: { totalCents: 1 }` and `totalCents: 1` is accepted and the
  stored receipt totals 1290.
- Each order gets the next deterministic pickup code; it is not in the 201 body and not in `GET /orders/:id` while held.

`GET /orders/:id`: `not-a-uuid` → 400 `validation`; an unknown UUID → 404 `order_not_found`. After
`repo.transition(id, "held", "paid", now)`: `status "paid"`, `pickupCode` = the generated code, `paidAt` = now, no
`checkoutUrl`, no `holdExpiresAt`. After `repo.releaseHold(id, "cancelled", "stripe_failed", now)` on a held order:
`status "cancelled"`, `cancelReason "stripe_failed"`, `cancelledAt`. After the cron expired it: `status "expired"`,
`expiredAt`, no `holdExpiresAt`.

Staff (`Authorization: Bearer staff-secret`):
- Every `/staff/*` route without the header, with `Bearer wrong`, with `Basic …`, → 401 `unauthorized`, body in the
  error shape. The token comparison is constant-time (not testable; the implementer's job).
- `GET /staff/orders?date=2026-11-09` → 200 `StaffBoardSchema`, `status "open"`, 44 slots in grid order, each
  `{ start, label, booked: 0, capacity: 20, orders: [] }` on an empty day; with a held order at S: that slot `booked 1`,
  `orders: []`; after `transition(id, "held", "paid", now)`: `orders` has one `StaffOrder` with `pickupCode`,
  `customerName`, `lines` (= the receipt's lines), `itemCount`, `totalCents 1290`, `paidAt`, `slotLabel "12:30"`,
  `status "paid"`; after Ready: `status "ready"`, `readyAt`; after pickup: `"picked_up"`, `pickedUpAt`. Orders are
  listed in `createdAt` order within a slot. `?date=2026-11-08` → `closed`, `[]`. No `date` → today in Berlin
  (`2026-11-09`; with the clock at `2026-11-09T23:30:00Z` it is `2026-11-10`). `?date=bad` → 400.
- `POST /staff/orders/:id/ready`: held → 409 `invalid_transition`; paid → 200 `StaffOrderSchema` with `status
  "ready"`, `readyAt` = now; again → 409; unknown UUID → 404 `order_not_found`; `not-a-uuid` → 400.
- `POST /staff/pickup`: `{ code: "ZZZZZZZZ" }` (no such order) → 404 `invalid_code`; `{ code: "abc" }` → 404
  `invalid_code`; `{}` → 400 `validation`; the paid order's code sent as lower case with a space and a hyphen inside →
  200 `picked_up`, `pickedUpAt` = now; a `ready` order → `picked_up`; already `picked_up` → 409 `invalid_transition`; a
  `held` order's code → 409 `invalid_transition`; `I`/`L`/`O` typed for `1`/`1`/`0` still find the order.

CORS (`cors.test.ts`): `OPTIONS /menu` with `Origin: https://web.example` and `Access-Control-Request-Method: GET` →
`Access-Control-Allow-Origin: https://web.example`; `Origin: http://localhost:3000` → allowed; `Origin:
https://evil.example` → no `Access-Control-Allow-Origin` header; a `GET /menu` with the allowed origin carries the
header; `Authorization` and `Content-Type` are allowed request headers.

Errors (`errors.test.ts`): `GET /nope` → 404 `{ error: { code: "not_found", message } }`; a route whose repository
throws (`makeDeps` with a repo whose `getMenu` rejects) → 500 `internal` with a message that is not the thrown error's
text; every error body parses with `ApiErrorSchema`; error responses are `application/json`.

Cron (`cron.test.ts`): two held orders, holds expiring 11:10Z and 11:12Z; clock → 11:11Z; `runCron(deps)` →
`{ released: 1 }`; the first is `expired`, the second still `held`; `getSlotUsage` reflects it; a second run → `{
released: 0 }`.

Repository contract (`contract.ts`), per implementation, fresh state per test:
- `getSettings()` equals `seedConfig`; `getMenu()` equals `seedMenu` (promo codes included).
- `getSlotUsage(from, to)`: `new Map()` on nothing; after `placeHold` of 3 items at S with capacity 20 →
  `Map { S.getTime() → { booked: 3, capacity: 20 } }`; `from` inclusive, `to` exclusive (S itself, S + 15 min).
- `placeHold(order, 20, E)`: returns an `Order` with `status "held"`, `holdExpiresAt` = E, `id` a UUID, `createdAt` a
  `Date`, every field of `NewOrder` echoed, nulls elsewhere; a second hold of 18 at S fits (booked 21? no: 3 + 18 =
  21 > 20 → `SlotFullError`, booked stays 3); 17 fits (booked 20); a `pickupCode` already used → throws (any `Error`)
  and books nothing.
- `getOrder` null for an unknown UUID; `findOrderByPickupCode` finds by the canonical code, null otherwise.
- `listOrders(from, to)`: the orders with `from ≤ slotStart < to`, by `slotStart` then `createdAt`, any status.
- `transition(id, "held", "paid", at, { stripePaymentIntentId: "pi_1" })` → `status "paid"`, `paidAt` = at,
  `stripePaymentIntentId "pi_1"`; again from `"held"` → null; `transition(id, ["paid", "ready"], "picked_up", at)` →
  `pickedUpAt`; unknown id → null; `transition(id, "paid", "ready", at)` → `readyAt`.
- `releaseHold(id, "expired", null, now)` → `status "expired"`, `expiredAt` = now, `holdExpiresAt` null, usage down;
  again → null; on a paid order → null; `("cancelled", "stripe_failed")` → `cancelReason`.
- `releaseExpiredHolds(now)`: only holds with `holdExpiresAt < now`, returned as `Order[]`, usage down; `[]` otherwise.
- `reserveForPaid(id, 20, "pi_2", now)` on an expired order → `status "paid"`, `paidAt`, `stripePaymentIntentId`,
  usage up; with the slot filled meanwhile (a hold of 20) → `SlotFullError`, still expired; on a held order →
  `InvalidStatusError`.
- `setCheckout(id, "cs_1", "https://checkout.stripe.com/c/pay/cs_1")` → `getOrder(id).stripeSessionId "cs_1"`
  (the URL is stored in M5's column; for now the contract only pins the session id).
- `recordStripeEvent("evt_1", "checkout.session.completed", id)` → true; again → false; `deleteStripeEvent("evt_1")`;
  then true again. `orderId` may be null.

## Done means
- `pnpm check` passes; `pnpm --filter @slot-order/api typecheck` passes (the stubs have the signatures).
- `pnpm test`: the core suite green; every new API test fails on `not implemented` (or an equivalent missing
  behaviour); `pnpm test:db`: the existing 78 green, `repository.test.ts` red on `not implemented`.
- Your report: files, tests per file, how they fail, `// SPEC:` points.
