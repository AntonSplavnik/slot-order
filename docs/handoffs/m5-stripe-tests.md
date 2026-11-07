# M5 brief: the Stripe test suite (tests first)

You write the **tests** for M5 (`apps/api`): the Checkout step of `POST /orders`, the webhook `POST /webhooks/stripe`,
the cron's second step, the `Payments` adapter and its fake, and the repository contract's new cases. Nothing of M5 is
implemented: `src/payments/{types,stripe,fake}.ts` are stubs whose functions throw `not implemented` (the fake's
factory itself works and answers an object whose methods throw), `src/routes/webhook.ts` throws, the order route
does not call `payments` yet, `runCron` answers `sessionsExpired: 0`, and both repositories ignore the URL in
`setCheckout` and `cancelled` in `transition`. Your tests are the specification the implementer must satisfy:
precise, readable, **red**.

## Read first
- `docs/design.md` **§9 in full** (§9.1 the session, §9.2 the webhook's five steps, §9.3 the refund order, §9.4 the
  `Payments` interface and the fake's abilities), §8.2 (the transition table), §8.4 (the cron and the race), §10
  (the route table, the `POST /orders` paragraph, the cron paragraph), §10.1 (`WebhookResponse`, `OrderSummary`),
  §10.2 (`Order.checkoutUrl`, `transition` to `cancelled`, `reserveForPaid` with a null intent, `setCheckout`), §10.3,
  §12, §13 rows "API" and "Database", §17 "`stripe` on Workers".
- `apps/api/src/payments/types.ts` (the interface, the errors, `RawStripeEventSchema`, `stripeEventFromRaw`),
  `src/payments/stripe.ts` (`StripeClient`, `checkoutSessionParams`, `createStripePayments`), `src/payments/fake.ts`
  (`FakePayments`, `createFakePayments`), `src/repo/types.ts`, `src/app.ts`, `src/cron.ts`, `src/errors.ts`.
- Every existing test under `apps/api/test/` and `test/helpers/app.ts` (`makeApp`, the clock, `placeOrder`,
  `payOrder`, `usageAt`, `expectJson`, `expectError`, `UNKNOWN_ID`): the new tests follow their style.
- The `stripe` package (23.1.0, in `node_modules`): `esm/Webhooks.d.ts` (`generateTestHeaderString({ payload, secret,
  timestamp })` answers `t=<seconds>,v1=<hex>`; `constructEventAsync`), `esm/resources/Checkout/Sessions.d.ts`.
- Core: `priceCart`, `line`, `seedMenu` to compute amounts instead of hard-coding where that reads better; **verify
  every number below against core** rather than trust this brief.

## You own
- `apps/api/test/routes/webhook.test.ts` (new), `test/routes/orders.test.ts` (additions), `test/routes/cron.test.ts`
  (update to the new shape and step 2).
- `apps/api/test/payments/fake.test.ts`, `test/payments/stripe.test.ts`, `test/payments/events.test.ts` (new).
- `apps/api/test/repo/contract.ts` (additions; it runs on both repositories), `test/db/helpers.ts` (`OrderRow` gains
  `checkout_url: string | null`), `test/db/schema.test.ts` (one test: `orders.checkout_url` is a nullable `text`
  column, via `information_schema.columns`).
- `apps/api/test/helpers/app.ts`: `TestDeps` becomes `AppDeps & { clock: Clock; payments: FakePayments }` (build the
  fake first, so tests read `deps.payments.calls`); helpers for the webhook: an event builder for the Stripe shape
  (`{ id, type, data: { object: { id, payment_status, payment_intent, metadata: { order_id } } } }`), and
  `postWebhook(app, signed)` sending `signed.body` as the raw string with `Stripe-Signature: signed.signature` and
  `Content-Type: application/json`. Keep every existing export.

## You must not
- Touch `src/`, configs, `package.json`, the core package, `docs/`, or the other test files. Commit.
- Read the real clock: sign with `deps.payments.signedEvent(raw, deps.clock.now())` and move the clock with
  `clock.set`. No network (the fake verifies signatures offline; `new Stripe("sk_test_offline")` in
  `stripe.test.ts` never sends anything).

## Facts the tests must pin (seed; now = `2026-11-09T11:00:00Z` unless noted; S = `2026-11-09T11:30:00Z`; WEB_ORIGIN = `https://web.example`)

### `POST /orders` (orders.test.ts)
- 201: `checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1"` at the top **and** as `order.checkoutUrl`; the
  stored order has `stripeSessionId "cs_test_1"` and the same `checkoutUrl`; `GET /orders/:id` while held repeats
  it; once paid, no `checkoutUrl` (and no `holdExpiresAt`). The second order of a test gets `cs_test_2`.
- `deps.payments.calls.createCheckout` has exactly one entry `{ orderId: order.id, params }` and `params` equals,
  literally: `mode "payment"`, `client_reference_id` = the id, `metadata { order_id: the id }`, `expires_at` =
  `Math.floor(new Date("2026-11-09T11:31:00Z").getTime() / 1000)` (now + 31 min, §9.1), `success_url
  "https://web.example/orders/<id>?paid=1"`, `cancel_url "https://web.example/orders/<id>"`, `line_items` for the
  Burger Menu: `[{ quantity: 1, price_data: { currency: "eur", unit_amount: 1290, product_data: { name: "Burger
  Menu" } } }]`. No other keys (`toEqual`). The customer's name appears nowhere in `params` (`JSON.stringify(params)`
  does not contain "Ada").
- Names and amounts: chicken-burger ×2 with options `burger-large`, `sauce-garlic` plus cola ×3 (5 items, total 2750)
  → two line items, `"2 × Chicken Burger (large, garlic)"` 1880 and `"3 × Cola 0.33 l"` 870, each `quantity: 1`;
  the same cart with `HAHN10` (total 2475) → 1692 and 783; Burger Menu with `HAHN10` → one item `"Burger Menu"` 1161.
  The sum of `unit_amount`s equals the receipt's `totalCents` in every case.
- Stripe fails (`deps.payments.fail("createCheckout")`): 502 `payment_unavailable`; the order is `cancelled` with
  `cancelReason "stripe_failed"` and `cancelledAt` = now; the slot is free again (`usageAt` → `{ booked: 0, capacity:
  20 }`); `GET /orders/:id` answers the cancelled summary; the call was recorded (one entry).
- Stripe is called only after the hold: a 409 `slot_full` (cola ×20 first) and a 400 `validation` record no
  `createCheckout` call.
- A repository whose `setCheckout` rejects (wrap the memory repository: its methods use no `this`, so `{ ...repo,
  setCheckout: async () => { throw new Error("db down"); } }` works) → 500 `internal`; the order stays `held` with
  `stripeSessionId null` and `checkoutUrl null`; the session was created (one call recorded).

### `POST /webhooks/stripe` (webhook.test.ts)
Body = `signed.body`, header `Stripe-Signature` = `signed.signature`, where `signed = await
deps.payments.signedEvent(raw, deps.clock.now())`. Every 200 parses with `WebhookResponseSchema`.
- A held order (from `placeOrder`), `checkout.session.completed` with `payment_status "paid"`, `payment_intent
  "pi_1"`, `metadata.order_id` = the id, event id `evt_1` → 200 `{ received: true }`; the order is `paid`, `paidAt`
  = now, `stripePaymentIntentId "pi_1"`; `GET /orders/:id` shows the pickup code; `usageAt` stays `{ booked: 1 }`;
  `GET /staff/orders?date=2026-11-09` lists it.
- The same signed request again (also after `clock.set` 1 minute later) → 200 `{ duplicate: true }`; `paidAt`
  unchanged; the id is taken: `deps.repo.recordStripeEvent("evt_1", "x", null)` → `false`.
- A different event id (`evt_2`) completing the already paid order → 200 `{ received: true }`, nothing changes.
- `payment_intent` as an expanded object `{ id: "pi_obj" }` → stored `"pi_obj"`.
- `payment_status "unpaid"` → 200 received, the order stays `held`; a replay → `duplicate` (it was recorded).
- Signatures, each 400 `bad_signature` with the error shape: no header; a header made by
  `createFakePayments({ webhookSecret: "whsec_other" }).signedEvent(...)`; the body with a space appended;
  signed 6 minutes ago (`signedEvent(raw, new Date(now − 360_000))`); a signed body that is not JSON (build the
  header yourself with `new Stripe("sk_test_offline").webhooks.generateTestHeaderString({ payload: "not json",
  secret: deps.payments.webhookSecret, timestamp: seconds(now) })`). Signed 4 minutes ago → accepted (the tolerance
  is 300 s). After a 400 nothing is recorded (`recordStripeEvent("evt_1", "x", null)` → `true`) and the order stays
  `held`.
- A signed body `{ "object": "event" }` (no `id`, no `type`) → 400 `validation`.
- Unknown order (`metadata.order_id` = `UNKNOWN_ID`) → 200 received, recorded (replay → duplicate). No metadata →
  200, recorded. `order_id "abc"` (not a UUID) → 200 received, recorded, nothing thrown.
- An unhandled type (`payment_intent.succeeded`) → 200 received, recorded.
- `checkout.session.expired` on a held order → 200; the order is `cancelled`, `cancelReason "session_expired"`,
  `cancelledAt` = now, the slot free; on an order the cron already expired → 200, it stays `expired` (no
  `cancelledAt`); on a paid order → 200, stays paid with its item booked.
- The race (§8.4): place at 11:00Z; `clock.set("2026-11-09T11:11:00Z")`; `runCron` → expired, slot free; the paid
  `completed` event → 200 received; the order is `paid`, `paidAt` = 11:11Z, `stripePaymentIntentId "pi_1"`, the
  slot shows `{ booked: 1 }` again; no refund call.
- The race with a full slot: order A expired by the cron, then a hold of cola ×20 at S (a second `placeOrder`), then
  A's `completed` → 200 received; A is `cancelled` with `cancelReason "refunded_slot_full"`, `cancelledAt` = now;
  `deps.payments.calls.refund` equals `[{ paymentIntentId: "pi_1", orderId: A.id }]`; the slot stays `{ booked:
  20 }`; `GET /orders/A` shows `cancelled` and the reason.
- The refund failing (`fail("refund")` in that setup) → 500 `internal`; A is already `cancelled`/`refunded_slot_full`
  (the cancel comes first, §9.3); the event row was removed, so the same signed request after `fail("refund",
  false)` → 200 `{ received: true }` (not a duplicate), a second entry in `calls.refund`, A still cancelled.
- A processing failure removes the event row: a repository whose `transition` rejects once ("db down") → 500
  `internal`, the order still `held`; the same signed request again → 200 received and the order `paid`.
- The re-read rule: a repository whose `transition` first expires the order (`repo.releaseHold(id, "expired", null,
  now)`) and then calls the real `transition` (which answers `null`) → 200 received, the order ends `paid` through
  `reserveForPaid`, slot `{ booked: 1 }`. A repository whose `transition` always answers `null` → 500 `internal`,
  the event row removed (the same request again is not a duplicate: it is handled again and fails again).
- The webhook needs no staff token and ignores the `Origin` header.

### The cron (cron.test.ts)
- `runCron(deps)` at 11:11Z → `{ released: 1, sessionsExpired: 1 }`; `deps.payments.calls.expireSession` =
  `["cs_test_1"]`; a second run → `{ released: 0, sessionsExpired: 0 }` and no new call; at 11:13Z both →
  `{ released: 2, sessionsExpired: 2 }`, calls `["cs_test_1", "cs_test_2"]`; at exactly 11:10Z → `{ released: 0,
  sessionsExpired: 0 }`.
- `fail("expireSession")` → `{ released: 1, sessionsExpired: 0 }`; the order is `expired` all the same; the call
  recorded.
- A hold placed straight on the repository (`deps.repo.placeHold(…)`, no session) and expired → counted in
  `released`, no `expireSession` call for it.

### The fake (payments/fake.test.ts)
`createFakePayments()`: `webhookSecret "whsec_test"`; `createCheckout(order, urls, now)` → `{ sessionId:
"cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }`, then `cs_test_2`; `calls.createCheckout[0]`
equals `{ orderId: order.id, params: checkoutSessionParams(order, urls, now) }`; `fail("createCheckout")` → rejects
with a `PaymentsError`, the call still recorded. Sessions are numbered by **successful** creations (§9.4): two
successes, one failure, then `fail("createCheckout", false)` and one success → `cs_test_3`, with four calls recorded.
`expireSession` and `refund` record their arguments (`refund` as `{ paymentIntentId, orderId }`) and throw
`PaymentsError` while failed.
`signedEvent(raw, now)` → `{ body: JSON.stringify(raw), signature }` with `signature` matching
`/^t=(\d+),v1=[0-9a-f]{64}$/` and `t` = `Math.floor(now / 1000)`; `verifyWebhook(body, signature, now)` answers
the `StripeEvent` reduction (`toEqual` the six fields); with another fake's signature, a changed body, a signature
from 6 minutes before `now`, or `null` → rejects with `BadSignatureError`. Build the `Order` with
`createMemoryRepository({ settings: seedConfig, menu: seedMenu }).placeHold(...)`.

### The adapter (payments/stripe.test.ts) and the reduction (payments/events.test.ts)
- A recording stub `StripeClient` (`checkout.sessions.create` answering `{ id: "cs_1", url: "https://…/cs_1" }`,
  `expire`, `refunds.create`, and `webhooks.constructEventAsync` taken from `new Stripe("sk_test_offline")`).
  `createCheckout(order, urls, now)` → `{ sessionId: "cs_1", url }` and the stub saw exactly
  `checkoutSessionParams(order, urls, now)`; the stub answering `url: null` → rejects with `PaymentsError`; the stub
  throwing `new Error("boom")` → `PaymentsError` whose `cause` is that error. `expireSession("cs_1")` → the stub saw
  `"cs_1"`; a throw → `PaymentsError`. `refund("pi_1", orderId)` → the stub saw `({ payment_intent: "pi_1" }, {
  idempotencyKey: "refund:<orderId>" })`; a throw → `PaymentsError`.
- `verifyWebhook` on `createStripePayments(new Stripe("sk_test_offline"), "whsec_x")`: a payload signed with
  `generateTestHeaderString({ payload, secret: "whsec_x", timestamp: seconds(now) })` → the reduction; the wrong
  secret, a tampered payload, `timestamp` = now − 301 s, `null` → `BadSignatureError`; now − 299 s → accepted; a
  signed `{}` → rejects with a `ZodError` (verified, then refused by `stripeEventFromRaw`).
- `checkoutSessionParams` directly: the literal params listed under `POST /orders` for the Burger Menu, the two-line
  cart and the `HAHN10` variants; `expires_at` for `now` = 11:00:00Z is 11:31:00Z in seconds; the URLs are taken
  from `urls` as given.
- `stripeEventFromRaw`: a full Stripe-shaped event → `{ id, type, sessionId, paymentStatus, paymentIntentId,
  orderId }` and nothing else; `payment_intent` as `{ id }` → the id; `null` → `null`; absent → `null`; no
  `metadata` or no `order_id` → `orderId null`; `order_id "abc"` → `null`; `order_id` a UUID → kept; no `data` →
  the four nulls; `{ id: "evt", type: "t" }` alone → the four nulls; missing `id` or `type` → throws a `ZodError`;
  unknown fields anywhere are dropped.

### Repository contract (contract.ts; both implementations)
- `placeHold` answers `checkoutUrl: null` (update the "nulls elsewhere" expectation).
- `setCheckout(id, "cs_1", "https://checkout.stripe.com/c/pay/cs_1")` → `stripeSessionId "cs_1"` **and**
  `checkoutUrl` = that URL; also on a paid order.
- `transition(id, "expired", "cancelled", at, { cancelReason: "refunded_slot_full" })` on an expired order →
  `status "cancelled"`, `cancelledAt` = at, `cancelReason "refunded_slot_full"`, `expiredAt` kept, the slot's
  `booked` unchanged (0 after the expiry); from `held` → `null` and the order stays held; from `paid` → `null`.
- `reserveForPaid(id, 20, null, now)` on an expired order → `paid` with `stripePaymentIntentId null`.

## Done means
- `pnpm check` and `pnpm typecheck` pass (the stubs carry every signature you use).
- `pnpm test`: the core suite green; every new test red on `not implemented` or the missing behaviour; the existing
  tests you updated (the cron shape, `checkoutUrl`) red for the same reason, every other existing test green.
- `pnpm test:db` (the local stack is running; `supabase db reset` was done with the new migration): the schema test
  green, the contract's new cases red on both repositories, everything else green.
- Your report: files, tests per file, how they fail, `// SPEC:` comments for every point where the spec is silent
  or contradicts itself (put them in the test next to the decision you took), and anything in this brief that core
  or the spec proved wrong.
