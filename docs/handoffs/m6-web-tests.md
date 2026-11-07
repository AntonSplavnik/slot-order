# M6 brief: the web library test suite (tests first)

You write the **tests** for the web app's library (`apps/web/src/lib/`, docs/design.md §11.2): pure functions the
screens call, tested without a DOM. Nothing of M6 is implemented: every function in `src/lib/*.ts` throws
`not implemented`; the screens do not exist yet. Your tests are the specification the implementer must satisfy:
precise, readable, **red**.

## Read first
- `docs/design.md` **§11 in full** (§11.1 the screens, so the texts and rules make sense; §11.2 every function's
  contract; §11.4 the list), §12 (the error codes), §10.1 (the API shapes), §7.1–§7.2 (the cart's rules), §3 rows
  "Staff" and "Pickup code".
- `apps/web/src/lib/*.ts` (the stubs: exported names, signatures, doc comments) and `apps/web/vitest.config.ts`.
- `packages/core/src/schemas/{api,cart,menu,orders,receipt,slots}.ts` and `packages/core/src/index.ts` (what core
  exports: `priceCart`, `CartSchema`, `ApiErrorCodeSchema`, the DTO schemas).
- The core fixtures `packages/core/test/fixtures/menu.ts` (`seedMenu`, `line`, `withInactiveItem`) and
  `slotConfigs.ts`; the API's test helpers `apps/api/test/helpers/app.ts` for the style (titles that state the
  expected behaviour and the §).
- **Verify every value below against the fixtures and core** before pinning it; tell me where this brief is wrong.

## You own
- `apps/web/test/cart.test.ts`, `menu.test.ts`, `options.test.ts`, `slots.test.ts`, `status.test.ts`,
  `errors.test.ts`, `api.test.ts`, `qr.test.ts`, `staffToken.test.ts`, `config.test.ts`.
- `apps/web/test/helpers.ts`: a `memoryStorage()` implementing `StorageLike` over a `Map` (and a `throwingStorage()`
  whose methods throw), a `stubFetch(answers)` that records every call (`input`, `init`) and answers queued
  `Response`s (build them with `Response.json(body, { status })` or `new Response(text, { status })`), and the
  public menu `publicMenu` = `seedMenu` without `promoCodes` (`PublicMenuSchema.parse(seedMenu)` strips it).
  Import the fixtures relative to the file (`../../../packages/core/test/fixtures/menu`), as the API tests do.

## You must not
- Touch `src/`, configs, `package.json`, the core package, the API, `docs/`. Add dependencies. Commit.
- Use the real clock or a DOM: `dayStrip`/`dayLabel` take the day as an argument; storage and fetch are injected.

## Facts the tests must pin (the seed menu; today = `2026-11-09`, a Monday)

### `cart.ts`
- `emptyCart()` → `{ lines: [] }` and no `promoCode` key. `itemCount(emptyCart())` → 0.
- `addLine(cart, "chicken-burger", ["burger-large", "sauce-garlic"])` → one line `{ itemId, quantity: 1, optionIds:
  ["burger-large", "sauce-garlic"] }`; again with the same ids → `quantity 2`; again with `["sauce-garlic",
  "burger-large"]` (another order) → still one line, `quantity 3`; with `["burger-regular", "sauce-garlic"]` → a
  second line; `addLine(cart, "cola", [])` → a third line with `optionIds: []`. Twenty adds of the same line stop at
  `quantity 20` (the 21st changes nothing). The input cart is not mutated (`toEqual` the original after the call;
  freeze it with `Object.freeze` where that reads well).
- `setQuantity(cart, 0, 5)` → 5; `(cart, 0, 25)` → 20; `(cart, 0, 0)` and `(cart, 0, -1)` remove the line;
  `(cart, 7, 3)` on a cart with one line → the same cart; `setQuantity(cart, 0, 2.7)` → floored to 2 (**SPEC:** the
  spec says nothing about non-integers; pin `Math.floor` and mark it).
- `removeLine(cart, 1)` removes the second line; a bad index → the same cart.
- `setPromoCode(cart, " hahn10 ")` → `promoCode "HAHN10"`; `setPromoCode(cart, "   ")` → no `promoCode` key.
- `itemCount` of chicken-burger ×2 and cola ×3 → 5.
- `priceLocally(publicMenu, cart)` equals `priceCart(seedMenu, { lines: cart.lines })` for a Burger Menu (total
  1290) and for the two-line cart above (2750); with `promoCode "HAHN10"` on the cart it still equals the receipt
  without a discount (the code is ignored locally, §11.2); an unknown item id throws a `CartError`
  (`unknown_item`) that propagates.
- Persistence: `loadCart(memoryStorage())` → `emptyCart()`; `saveCart` then `loadCart` → the same cart (`toEqual`);
  the stored string is JSON that `CartSchema` parses; `loadCart` after `storage.setItem(CART_KEY, "{not json")` →
  empty; after storing `{ lines: [{ itemId: "x" }] }` (fails the schema) → empty; after storing `{ lines: [] ,
  promoCode: 7 }` → empty; `loadCart(throwingStorage())` → empty; `clearCart` removes the key (`getItem` → null).
  `CART_KEY` is `"slot-order.cart"`.

### `menu.ts`
- `menuSections(publicMenu)` → three sections in the order `food`, `drinks`, `menus` with titles "Food", "Drinks",
  "Menus"; Food = `half-chicken`, `chicken-burger`, `chicken-wings`, `fries`, `coleslaw` (that order, by `sort`);
  Drinks = `ayran`, `cola`, `water`; Menus = `burger-menu`, `wings-menu`. Compare ids with `map(i => i.id)`.
- An inactive item is hidden: `withInactiveItem(seedMenu, "coleslaw")` (then stripped of promo codes) → Food has
  four items; a menu whose only drink is inactive has no Drinks section (build one with the fixture helpers or a
  literal); `menuSections` on items given in reverse `sort` order still answers them sorted.
- `itemById(publicMenu, "fries")` → the fries item; an unknown id → `undefined`.

### `options.ts` (read the fixture's groups: chicken-burger has Size (`burger-regular` 0, `burger-large` +150) and
Sauce (`sauce-garlic`, `sauce-chili`, `sauce-honey-mustard`), chicken-wings has Heat, fries has Size; check each
group's `minChoices`/`maxChoices` in the fixture and pin them where they matter)
- `toggleOption(sizeGroup, [], "burger-large")` → `["burger-large"]`; `(sizeGroup, ["burger-regular",
  "sauce-garlic"], "burger-large")` → `["sauce-garlic", "burger-large"]`? Pin the exact order the spec implies:
  the other group's ids stay, the group's old choice leaves, the new one is appended. Tapping the chosen one again
  in a `maxChoices: 1` group keeps it (radio). An id that is not in the group → the selection unchanged. For a
  group with `maxChoices > 1` (build one with the fixture's `withOption` or a literal group of three options with
  `maxChoices 2`): toggling adds, toggling again removes, a third choice beyond the max is refused.
- `selectionValid(chickenBurger, ["burger-large", "sauce-garlic"])` → true; `[]` → false when a group has
  `minChoices ≥ 1` (check the fixture); `["burger-large", "burger-regular", "sauce-garlic"]` (two from a max-1
  group) → false; `["burger-large", "sauce-garlic", "nope"]` → false; `["burger-large", "sauce-garlic",
  "sauce-garlic"]` (an id twice) → false; `selectionValid(cola, [])` → true; `selectionValid(cola, ["x"])` → false.
- `optionNames(chickenBurger, ["sauce-garlic", "burger-large"])` → `["large", "garlic"]` (the menu's order: Size
  before Sauce); `unitPrice(chickenBurger, ["burger-large", "sauce-garlic"])` → 940; `unitPrice(fries,
  ["fries-large"])` → 450; `unitPrice(cola, [])` → 290. (Cross-check with `priceCart`'s `unitGrossCents`.)

### `slots.ts`
- `dayStrip("2026-11-09")` → the seven days `2026-11-09` … `2026-11-15`; `dayStrip("2026-11-28")` crosses the month
  end (`…, "2026-11-30", "2026-12-01", …, "2026-12-04"`); `dayStrip("2026-12-30")` crosses the year; `dayStrip(d, 1)`
  → `[d]`; `dayStrip(d, 3)` has three days. Every entry matches `DayStringSchema`.
- `chip({ start, label: "12:30", available: 20, bookable: true })` → `{ label: "12:30", disabled: false, hint:
  null }`; with `bookable: false` and `reason` `past` → hint "Already started"; `cutoff` → "Too late to order";
  `too_soon` → "Too soon"; `full` → "Full"; each `disabled: true`.
- `dayLabel("2026-11-09", "2026-11-09")` → "Today"; `("2026-11-10", "2026-11-09")` → "Tomorrow"; `("2026-11-11",
  "2026-11-09")` → "Wed 11 Nov"; `("2026-12-01", "2026-11-09")` → "Tue 1 Dec"; `("2026-11-08", "2026-11-09")`
  (yesterday) → "Sun 8 Nov". The label never depends on the process time zone: the config sets `TZ=UTC`, and the
  implementer is told to build it from the day string, not from `new Date(day)` in local time.
- `dayStatusText`: `closed` → "Closed", `past` → "Past", `too_far` → "Not yet", `open` → "".

### `status.ts` (build summaries with a helper: a `paid` summary has `pickupCode`, `paidAt`; a `held` one
`checkoutUrl`, `holdExpiresAt`; `slotLabel "12:30"`; validate each with `OrderSummarySchema`)
- Exactly the titles, bodies and tones of §11.2 `status.ts` for every status; `paid` and `ready` bodies contain
  the slot label ("Pick up at 12:30. Show this code at the counter." and "Pick up at 12:30."); `cancelled` with
  each of the three reasons, and without a reason → "Nothing was charged.".
- `shouldPoll("held")` → true; every other status → false (iterate `ORDER_STATUSES`).

### `errors.ts`
- `errorText(code)` is a non-empty string ending with a full stop for every code in `ApiErrorCodeSchema.options`
  plus `"network"` and `"invalid_response"`; a few pinned: `slot_full` → "That slot is full.", `promo_invalid` →
  "The promo code is not valid.", `network` → "The connection failed. Check your network and try again.",
  `invalid_response` → "The server answered something unexpected.", `unauthorized` → "The staff token is not
  valid." (**SPEC:** §11.2 pins no wording but these; mark the pinned ones as the brief's choice.)

### `api.ts` (every call through `stubFetch`; `createApi("https://api.example", stub)`)
- `menu()`: one call, `GET https://api.example/menu` (no body); a 200 whose body is `publicMenu` → `toEqual`; a
  200 `{}` → rejects with `ApiClientError` `{ status: 200, code: "invalid_response" }`.
- `slots("2026-11-09", 3)` → `GET …/slots?date=2026-11-09&items=3`; `slots("2026-11-09")` → `…/slots?date=2026-11-09`
  (no `items`); the body parsed with `SlotsResponseSchema`.
- `quote(cart)` → `POST …/quotes`, header `Content-Type: application/json`, body `JSON.stringify(cart)`; the answer
  parsed with `ReceiptSchema`; a 400 `{ error: { code: "promo_invalid", message: "…" } }` → rejects with
  `ApiClientError { status: 400, code: "promo_invalid", message: "…" }`; a 400 `unknown_item` with `lineIndex: 1`
  → `lineIndex 1`.
- `createOrder(request)` → `POST …/orders`; a 201 parsed with `CreateOrderResponseSchema`; a 409 `slot_full` →
  code `slot_full`, status 409; a 502 `payment_unavailable` → that code.
- `order(id)` → `GET …/orders/<id>`; a 404 `order_not_found` → that code.
- `staffBoard("tok", "2026-11-09")` → `GET …/staff/orders?date=2026-11-09` with `Authorization: Bearer tok`;
  `staffBoard("tok")` → `GET …/staff/orders` (no query); a 401 `unauthorized` → that code.
- `staffReady("tok", id)` → `POST …/staff/orders/<id>/ready` with the header; `staffPickup("tok", "a1b1 c001")`
  → `POST …/staff/pickup` with body `{ "code": "a1b1 c001" }` (sent as typed; the API normalises).
- A non-2xx answer whose body is not the error shape (`new Response("<html>", { status: 502 })`) → `code
  "internal"`, status 502. A `fetchFn` that rejects (`new TypeError("fetch failed")`) → `code "network"`, status 0,
  and the message is the cause's. Every `ApiClientError` is `instanceof Error` with `name "ApiClientError"`.
- The base URL is used as given (the caller strips the slash, §11.2 `config.ts`); the client never adds one.

### `qr.ts`, `staffToken.ts`, `config.ts`
- `pickupUrl("https://web.example", "A1B1C001")` → `"https://web.example/staff/pickup?code=A1B1C001"`; a code
  with a lower-case letter is sent as given. `await qrSvg("https://web.example/staff/pickup?code=A1B1C001")` starts
  with `<svg`, contains `viewBox`, and differs from the SVG of another text.
- `loadStaffToken(memoryStorage())` → null; after `saveStaffToken(s, "tok")` → "tok"; `clearStaffToken` → null;
  `loadStaffToken(throwingStorage())` → null; `STAFF_TOKEN_KEY` is `"slot-order.staff-token"`.
- `apiBaseUrl()` with `process.env.NEXT_PUBLIC_API_URL` unset → `"http://localhost:8787"`; set to
  `"https://api.example/"` → `"https://api.example"` (one trailing slash removed); set to `""` → the default.
  Save and restore the variable in `beforeEach`/`afterEach`.

## Done means
- `pnpm check` and `pnpm typecheck` pass (the stubs carry every signature you use).
- `pnpm --filter @slot-order/web test`: every test red on `not implemented` (or an equivalent missing behaviour);
  `pnpm test` as a whole: core and API green, web red for that reason only.
- Your report: files, tests per file, how they fail, `// SPEC:` points (in the test next to the decision), and
  anything in this brief that the fixtures, core or the spec proved wrong.
