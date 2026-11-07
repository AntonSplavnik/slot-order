# M6 brief: implement the web app against the tests

You implement `apps/web` (docs/design.md §11) so that **every test under `apps/web/test/` passes** and the screens of
§11.1 work against the API, with the existing suites still green. The tests were written first, from the spec; they
are the specification of the library. You do not change them.

## Read first
- `docs/design.md` **§11 in full** (§11.1 screens, §11.2 the library contract, §11.3 configuration and deployment,
  §11.4), §10 and §10.1 (the API, its shapes), §12 (error codes), §3 rows "Staff", "Pickup code", "Web hosting",
  §17 "Next.js on Cloudflare".
- `apps/web/src/lib/*.ts` (the stubs: keep every exported name and signature), `apps/web/package.json`,
  `tsconfig.json`, `vitest.config.ts`, `.env.example`; every test under `apps/web/test/`.
- `packages/core/src/schemas/*.ts` and `packages/core/src/index.ts`; the API's routes in `apps/api/src/routes/` for
  what each endpoint answers; `apps/api/wrangler.toml` and `apps/api/.dev.vars.example` (`WEB_ORIGIN`).
- The OpenNext guide at https://opennext.js.org/cloudflare/get-started and Cloudflare's
  https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/ (§17 summarises them).

## You own
- `apps/web/src/lib/*.ts` (the implementations), `apps/web/src/app/**` (the screens: `layout.tsx`, `globals.css`,
  `page.tsx`, `checkout/page.tsx`, `orders/[id]/page.tsx`, `staff/page.tsx`, `staff/pickup/page.tsx`, and the
  components you need under `src/components/`), `apps/web/next.config.ts`, `open-next.config.ts`, `wrangler.toml`,
  `postcss.config.mjs`, `public/_headers`, `apps/web/tsconfig.json` only if Next needs a change (keep it extending
  the base; say what you changed and why).
- `apps/api/wrangler.toml`: `WEB_ORIGIN` → `https://slot-order-web.antonsplavnik.workers.dev`;
  `apps/api/.dev.vars.example`: add `WEB_ORIGIN=http://localhost:3000` with a comment (the local override). Do not
  touch `apps/api/.dev.vars` (git-ignored; the orchestrator adds the line).
- `.github/workflows/ci.yml`: the deploy job's web step after the API step: `pnpm --filter @slot-order/web deploy`
  with `NEXT_PUBLIC_API_URL: https://slot-order-api.antonsplavnik.workers.dev` and the two Cloudflare secrets in
  `env`. Nothing else in CI.

## You must not
- Edit tests, the core package, the API's source, `package.json` dependencies (everything needed is installed:
  `next`, `react`, `tailwindcss`, `@tailwindcss/postcss`, `qrcode`, `@opennextjs/cloudflare`, `wrangler`, `zod`,
  `@slot-order/core`; `date-fns` is not a web dependency: use `Date.UTC` arithmetic and `Intl.DateTimeFormat` with
  `timeZone: "UTC"` on the day string for `dayStrip`/`dayLabel`). Commit. Deploy (the orchestrator and Anton do).
- Read `localStorage`, `window` or `fetch` inside `src/lib/`: they are injected (`StorageLike`, `FetchLike`); the
  screens pass `window.localStorage` and the global `fetch`.
- Put a secret anywhere. The staff token stays in the browser's `localStorage` and the `Authorization` header.

## How
- `config.ts`: reference `process.env.NEXT_PUBLIC_API_URL` **literally** (Next inlines it at build time only when
  the expression is spelled out). `api.ts`: one `request(method, path, { body?, token? })` helper building the URL
  on `baseUrl`, parsing JSON, mapping errors as §11.2 says (`ApiErrorSchema.safeParse` on a non-2xx body); every
  method parses its answer with the core schema (`PublicMenuSchema`, `SlotsResponseSchema`, `ReceiptSchema`,
  `CreateOrderResponseSchema`, `OrderSummarySchema`, `StaffBoardSchema`, `StaffOrderSchema`).
- `cart.ts`: pure; copy on write; `CartSchema.safeParse` on load; the option set compared as sorted ids.
  `priceLocally`: `priceCart({ ...menu, promoCodes: [] }, { lines: cart.lines })`.
- Screens (`"use client"` where state lives; the App Router pages can be client components that fetch on mount):
  - `/` (`page.tsx`): loads the menu through the client, renders `menuSections`, the option sheet (a bottom sheet or
    a modal; radio inputs for `maxChoices: 1`, checkboxes otherwise; **Add** disabled until `selectionValid`), the
    cart in `localStorage` through `loadCart`/`saveCart`, the cart bar with `itemCount` and `priceLocally`'s total
    linking to `/checkout`. A `CartError` from `priceLocally` (an item vanished from the menu) drops that line.
  - `/checkout`: the lines with steppers (`setQuantity`) and remove, the name input, the day strip (`dayStrip` from
    today in Berlin: compute today with `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" })`, which
    formats as `YYYY-MM-DD`), one `slots(date, itemCount)` call per selected day (and the strip's statuses from a
    `slots` call per day, lazily or at once; keep it simple), chips through `chip`, the promo field (`quote` with
    the code; `promo_invalid` shown inline), the receipt (`priceLocally` without a code, the `quote` answer with
    one), **Pay** → `createOrder` → `clearCart` → `window.location.assign(checkoutUrl)`. Errors through
    `errorText`; a 409 slot error reloads the slots. An empty cart redirects to `/`.
  - `/orders/[id]`: `order(id)` on mount, `setInterval` 3 s while `shouldPoll`; `statusView` for the texts;
    `paid`/`ready`: the QR (`qrSvg(pickupUrl(window.location.origin, pickupCode))` rendered with
    `dangerouslySetInnerHTML`; it is our own SVG), the code in large monospace letters, the slot label, the
    receipt lines and VAT lines; `held`: a "Continue to payment" link to `checkoutUrl` and "Confirming your
    payment…" when `?paid=1` is in the URL (`useSearchParams`).
  - `/staff`: the token from `loadStaffToken`, a form when absent; `staffBoard(token, date)`; sections per slot
    with `booked/capacity`, cards with the buttons calling `staffReady`/`staffPickup` then reloading; `setInterval`
    10 s; a `<input type="date">` for other days; a 401 → `clearStaffToken` and the form again.
  - `/staff/pickup`: reads `code` from the query (`useSearchParams`, wrapped in `<Suspense>` as Next requires),
    asks for the token when absent, calls `staffPickup` once, shows the order (code, name, lines, slot) and
    "Picked up ✓", or `errorText` of the failure with a retry button.
  - Layout: a small header with "Goldhahn" and a "Staff" link in the footer only; Tailwind utility classes; one
    accent colour; mobile-first widths (`max-w-md mx-auto`). Money as `€12.90` (`(cents / 100).toFixed(2)` with a
    comma? Use `Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })` → "12,90 €"; pick one and use
    it everywhere through a `formatCents` in `src/lib/money.ts`, which you may add with its own tests).
- Config: `next.config.ts` with `transpilePackages: ["@slot-order/core"]` and `initOpenNextCloudflareForDev()`;
  `open-next.config.ts` with `defineCloudflareConfig()`; `wrangler.toml` as §11.3 (`name = "slot-order-web"`,
  `main = ".open-next/worker.js"`, `compatibility_date = "2026-11-07"`, `compatibility_flags = ["nodejs_compat"]`,
  `[assets]`, `upload_source_maps = true`, `[observability] enabled = true`); `postcss.config.mjs`; `globals.css`
  with `@import "tailwindcss";`; `public/_headers`.
- Prove the build: `pnpm --filter @slot-order/web build` must pass (`next build`), and `pnpm --filter
  @slot-order/web exec opennextjs-cloudflare build` must produce `.open-next/worker.js` (do not deploy). If Next
  rewrites `tsconfig.json`, keep the result minimal and report it.
- Run the app against the local API: `pnpm dev` (both), `.env.local` from `.env.example`; walk the flow in a
  browser if one is available to you, else at least `curl` the pages for 200s. The API's `.dev.vars` already
  carries the Stripe test key; paying is not required for your check.

## Done means
- `pnpm test` green (core, API, web), `pnpm typecheck`, `pnpm check` (run `pnpm format`), `pnpm --filter
  @slot-order/web build` green, the OpenNext build produces a worker.
- Your report: files, the decisions you took where the spec left room (so I can write them into §11), the
  results of the build and of your run against the local API, any test you believe is wrong.

## From the test agent's report (read before you start)
- 212 tests in 10 files under `apps/web/test/`; `test/helpers.ts` has `memoryStorage`, `throwingStorage`,
  `stubFetch`, `publicMenu` (deep-frozen), builders `summary`/`staffOrder` validated with core's schemas, the carts
  `BURGER` (1290) and `TWO_LINES` (a large garlic burger ×2 and three colas, 2750).
- `CartSchema` wants at least one line, so `emptyCart()` is not a valid `Cart` for the schema: `saveCart` of an
  empty cart removes the key; `loadCart` falls back to empty on anything invalid. `saveCart`/`clearCart` and the
  staff token helpers never throw (a throwing storage is swallowed).
- `setQuantity` floors a non-integer (0.5 removes the line); a bad or negative index answers an equal cart (a copy
  or the same object both pass `toEqual`).
- `itemById` finds inactive items (it is a lookup; `menuSections` does the hiding).
- Radio groups: `["burger-regular", "sauce-garlic"]` + `burger-large` → `["sauce-garlic", "burger-large"]`
  (the old id leaves, the new one is appended, other groups' ids stay in place); tapping the chosen option keeps it,
  also in a `minChoices: 0` group. The seed's Sauce group is min 0, max 2 (checkbox semantics): a third sauce is
  refused; an id of another group or item is refused.
- `chip` of a non-bookable slot without a reason: disabled, hint null. `dayLabel` never shows the year ("Sat 2 Jan"
  seen from 2026-12-31) and must not depend on the process time zone (tests switch `TZ` to Honolulu and Kiritimati
  at runtime): build it from the day string with `Date.UTC` and `Intl.DateTimeFormat("en-GB", { timeZone: "UTC",
  weekday: "short", day: "numeric", month: "short" })`, and check the exact output ("Wed 11 Nov", no comma).
- `errorText`: the five pinned texts in §11.2; every other code a short sentence with a capital and a full stop.
- `api.ts`: a 2xx body that is not JSON → `invalid_response`; a network failure → `network`, status 0, the
  cause's message; an error body with a code outside §12 → `internal` with the status; public calls send no
  `Authorization` header; the base URL is used as given (a path prefix kept, no slash added);
  `staffPickup` sends the code as typed. `qrSvg` must equal `qrcode`'s `toString(text, { type: "svg", margin: 1 })`
  exactly.
- `pnpm -r test` stops at the first failing package, so run `pnpm --filter @slot-order/web test` while working.

