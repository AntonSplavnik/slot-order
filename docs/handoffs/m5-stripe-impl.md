# M5 brief: implement Stripe against the tests

You implement M5 (`apps/api`) so that **every test under `apps/api/test/` passes**: the routes (`orders`, `webhook`,
`cron`), the payments adapter and its fake, and the repository contract on both implementations (`pnpm test` on
the memory one, `pnpm test:db` on Supabase), with the existing suites still green. The tests were written first,
from the spec; they are the specification. You do not change them.

## Read first
- `docs/design.md` **§9 in full** (§9.1 the session, §9.2 the webhook's five steps, §9.3 the refund order, §9.4
  the `Payments` interface, the adapter, the fake), §8.2 (the transition table), §8.4 (the cron and the race), §10
  (the route table, the `POST /orders` paragraph, the cron paragraph), §10.1–§10.3, §12, §5 (`orders`,
  `stripe_events`, the functions and the PostgREST null-row note), §17 "`stripe` on Workers" (why the Web Crypto
  provider and `constructEventAsync`).
- `apps/api/src/payments/types.ts`, `stripe.ts`, `fake.ts` (the stubs: keep every exported name and signature),
  `src/routes/webhook.ts`, `src/routes/orders.ts`, `src/routes/present.ts`, `src/cron.ts`, `src/errors.ts`,
  `src/repo/types.ts`, `src/repo/memory.ts`, `src/repo/supabase.ts`, `src/db/rows.ts`, `src/index.ts`.
- Every test under `apps/api/test/` and `test/helpers/app.ts`.
- The `stripe` package (23.1.0, in `node_modules`): `esm/Webhooks.d.ts`, `esm/resources/Checkout/Sessions.d.ts`,
  `esm/resources/Refunds.d.ts`, `esm/platform/WebPlatformFunctions.js`.

## You own
- `src/payments/types.ts` (`stripeEventFromRaw`), `src/payments/stripe.ts` (`checkoutSessionParams`,
  `createStripePayments`, plus a shared verification function the fake reuses), `src/payments/fake.ts`
  (`createFakePayments`), `src/routes/webhook.ts`, `src/routes/orders.ts` (the Checkout step), `src/routes/present.ts`
  (`checkoutUrl` from the order), `src/cron.ts` (step 2), `src/repo/memory.ts` and `src/repo/supabase.ts`
  (`setCheckout` storing the URL, `transition` to `cancelled` with `cancelledAt` and `cancelReason`,
  `reserveForPaid` with a null intent), `src/errors.ts` and `src/index.ts` only if the wiring needs it.

## You must not
- Edit tests, fixtures, the core package, configs, `package.json`, `wrangler.toml`, migrations (the column exists:
  `supabase/migrations/20261107120000_checkout_url.sql`), CI. Add dependencies (`stripe` is installed). Commit.
- Read the clock anywhere but through `deps.now` (also for `expires_at` and the webhook's `receivedAt`).
- Let a key, the webhook secret or the staff token appear in any response or log. Never write a real key anywhere.

## How
- `stripeEventFromRaw(raw)`: `RawStripeEventSchema.parse(raw)`, then the six fields; `paymentIntentId` is the string
  or the expanded object's `id`; `orderId` is `metadata.order_id` only when `z.uuid().safeParse` accepts it.
- `checkoutSessionParams(order, urls, now)` is pure: one `line_item` per `order.lines` entry with `quantity: 1` and
  `price_data: { currency: "eur", unit_amount: lineGrossCents − discountCents, product_data: { name } }`; the name
  is `name`, with ` (option, option)` when the line has option names and the prefix `"<quantity> × "` only when
  the quantity is above one; `mode: "payment"`, `client_reference_id` and `metadata.order_id` = `order.id`,
  `expires_at = Math.floor((now.getTime() + 31 * 60_000) / 1000)`, `success_url` and `cancel_url` from `urls`.
  Exactly the keys the tests pin, nothing else.
- `createStripePayments(stripe, webhookSecret)`: every Stripe call in a try/catch that throws
  `new PaymentsError(message, { cause })`; an answer without `url` is a `PaymentsError` too; `refund` passes
  `{ idempotencyKey: \`refund:${orderId}\` }` as the request options; `verifyWebhook`: a `null` signature →
  `BadSignatureError`; `stripe.webhooks.constructEventAsync(rawBody, signature, secret, 300,
  Stripe.createSubtleCryptoProvider(), now.getTime())` (`receivedAt` in **milliseconds**: the library divides by
  1000 itself) in a try/catch → `BadSignatureError`; then
  `stripeEventFromRaw(event)` (its `ZodError` propagates: the route answers 400 `validation`). Import `Stripe` as a
  value (`import Stripe from "stripe"`) for `createSubtleCryptoProvider`; the Node build in Vitest and the Web
  build on the Worker both have it. Put the verification in one exported function the fake calls as well.
- `createFakePayments({ webhookSecret })`: a counter of successful creations names the sessions; `fail` flags per
  method; every call recorded before the failure check; `signedEvent(raw, now)` signs `JSON.stringify(raw)` with
  `new Stripe("sk_test_offline").webhooks.generateTestHeaderStringAsync({ payload, secret, timestamp: seconds })`
  (one offline instance per fake; it never sends anything); `verifyWebhook` is the shared verification on that
  instance with the fake's secret.
- The webhook route (`src/routes/webhook.ts`), §9.2 in order: `await c.req.text()`, the `stripe-signature` header
  or `null`; `verifyWebhook`; `recordStripeEvent(event.id, event.type, event.orderId)` → `false` → `200 { duplicate:
  true }`; then the handling in a try/catch: on a throw, `deleteStripeEvent(event.id)` in its own try/catch (log a
  failure, never the body) and rethrow (→ 500 `internal` through `onError`). The `completed` rule with the
  conditional updates and the one re-read (a loop of at most two attempts; a second miss throws). `getSettings()`
  gives the capacity for `reserveForPaid`. Answer `200 { received: true }`.
- The order route, after `placeHold`: `payments.createCheckout(order, { success: \`${webOrigin}/orders/${id}?paid=1\`,
  cancel: \`${webOrigin}/orders/${id}\` }, now)`; a `PaymentsError` → `releaseHold(id, "cancelled", "stripe_failed",
  now)` then `throw new ApiError("payment_unavailable")`; then `setCheckout(id, sessionId, url)`; the summary comes
  from the order with the session and URL filled in, and the 201 body repeats the URL at the top.
- `present.ts`: a held order's `checkoutUrl` is `order.checkoutUrl` (null until stored).
- The cron: after `releaseExpiredHolds`, for each order with a `stripeSessionId`, `expireSession` in a try/catch:
  a success counts, a failure is logged (the message, never the body) and skipped.
- The memory repository mirrors §5 and §8.2: `transition` to `cancelled` stamps `cancelledAt` and takes
  `patch.cancelReason`; `setCheckout` stores both fields; `reserveForPaid` with `null` stores `null`. The Supabase
  repository: `.update({ stripe_session_id, checkout_url })`, the `cancel_reason` column in the patch,
  `STAMP_COLUMN.cancelled` is already there.
- Routes stay thin; the webhook's rules live in one function in the route file (or `src/webhook/handle.ts` if that
  reads better), with the §9.2 step numbers in comments.
- If a test contradicts the spec, do not edit it; implement the spec, let it fail, report it.

## Done means
- `pnpm test` green (core + api), `pnpm test:db` green (the local stack is running; run `supabase db reset` first if
  in doubt), `pnpm typecheck`, `pnpm check` (run `pnpm format`).
- Your report: files, the decisions you took where the spec left room, the results, any test you believe is wrong.

## From the test agent's report (read before you start)
- `receivedAt` is **milliseconds** (`now.getTime()`), not seconds: `validateComputedSignature` in stripe's
  `esm/Webhooks.js` does `Math.floor(receivedAt / 1000) - t`. Four tests pin it (a signature 6 minutes old must be
  refused, 299 s old accepted, measured from `now`, not the host's clock).
- The test agent proved the suite satisfiable with a throwaway reference implementation (287 + 122 green) and
  mutation-tested it: seconds instead of milliseconds, the host clock, refund-before-cancel, no re-read and no
  event-row deletion are each caught. Do not look for that implementation; it was outside the repo and is gone.
- Exactly two `transition` attempts per `completed` request for a held order: one update, one re-read and one more
  update; a second miss throws (`webhook.test.ts` counts the calls).
- A paid session without a payment intent pays the order with `stripePaymentIntentId null` (now in §9.2).
- When `deleteStripeEvent` fails after a failed handling, the answer is still 500 `internal`; a replay is then a
  duplicate (now in §9.2 step 5).
- `expires_at` is floored to the second (`Math.floor`), pinned for a `now` with milliseconds (now in §9.1).
- A refund retry leaves `cancelledAt` at the first cancel (the conditional update matches no row the second time;
  only the refund runs again). `completed` for an order cancelled with `session_expired` does nothing and refunds
  nothing. Events for unknown orders carry a different session id; nothing looks an order up by session id.
- A pretty-printed signed body must verify (no JSON parsing before verification).
- The fake records a call before checking its `fail` flag; sessions are numbered by successful creations.
- The helpers: `TestDeps.payments` is a `FakePayments`; `DepsOverrides` lets a test pass another fake or a wrapped
  repository (the memory repository's methods use no `this`, so `{ ...repo, transition: … }` works).
- The race test places order A at 10:55Z and runs the cron at 11:06Z (S would be `slot_too_soon` for the second
  order after 11:10Z); the amounts: 1290; 2750 = 1880 + 870; with HAHN10 2475 = 1692 + 783; Burger Menu with
  HAHN10 1161; `expires_at` 1794223860 for now = 11:00:00Z.
