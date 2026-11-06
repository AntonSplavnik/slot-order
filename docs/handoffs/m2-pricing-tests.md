# M2 brief: the pricing and orders test suite (tests first)

You write the **tests** for pricing (§7), order transitions and pickup codes (§8.2, §8.3) of `packages/core`. The
implementation does not exist: `src/pricing/index.ts` and `src/orders/index.ts` hold stubs that throw; the schemas in
`src/schemas/{menu,cart,receipt,orders}.ts` and `CartError` in `src/pricing/errors.ts` are the contract. Your tests are
the specification the implementer must satisfy: precise, readable, **red** when you are done.

## Read first
- `docs/design.md` §3 (rows "Money", "VAT", "Capacity", "Pickup code"), §5 Seed (the menu, the ids, the promo codes),
  **§7 in full**, §8.1–§8.3, §13 rows "Pricing" and "Orders".
- The schema files and stubs named above. Import from `../../src/index`.

## You own
- `packages/core/test/fixtures/menu.ts`: `export const seedMenu: Menu`, the Goldhahn menu of §5 with exactly the ids of
  §5, prices in cents, `vatRates: { food: 7, drink: 19 }`, `kind`, `sort` in menu order, `active: true` everywhere
  except as noted below. Groups: `chicken-burger-size` (min 1, max 1: `burger-regular` +0, `burger-large` +150),
  `chicken-burger-sauce` (min 0, max 2: `sauce-garlic`, `sauce-chili`, `sauce-honey-mustard`, all +0),
  `chicken-wings-heat` (min 1, max 1: `wings-mild`, `wings-hot`), `fries-size` (min 1, max 1: `fries-regular` +0,
  `fries-large` +100). Combos: `burger-menu` 1290 = `chicken-burger` ×1 + `fries` ×1 + `cola` ×1; `wings-menu` 1190 =
  `chicken-wings` ×1 + `fries` ×1 + `cola` ×1. Promo codes: `HAHN10` percent 10 active, `WELCOME3` fixed 300 active,
  `OLD` percent 50 inactive. Also export small helpers to derive variants (`withItem`, `withPromo`, an inactive item,
  a negative-delta option) rather than copying the menu.
- `packages/core/test/pricing/validate.test.ts`, `amounts.test.ts` (unit/line gross, discount, allocation),
  `vat.test.ts` (splitVat, parts, summary, the worked examples), `property.test.ts` (the seeded random-cart
  invariants), `packages/core/test/orders/transitions.test.ts`, `pickupCode.test.ts`, and
  `packages/core/test/pricing/schemas.test.ts` for the Zod schemas.

## You must not
- Touch anything under `src/`, the configs, `package.json`, or other tests. Ambiguity or contradiction in the spec:
  **do not guess**; test what the spec says, mark the test with `// SPEC:` and list it in your report.
- Use `Math.random`, `Date`, snapshots. The property test uses a small seeded PRNG you write in the test file
  (e.g. mulberry32), fixed seed, ~200 carts.

## Facts the tests must pin
Validation (`priceCart` throws `CartError` with `code` and, per line, `lineIndex`; check both):
- `{ lines: [] }` → `empty_cart`. 31 lines → `too_many_lines`. These come before any line error.
- Order per line, each tested on its own: unknown item id → `unknown_item`; an inactive item → `item_inactive`;
  `burger-menu` with any `optionIds` → `options_on_combo`; `chicken-burger` with `wings-mild` → `unknown_option`;
  `chicken-burger` with `burger-large` twice → `duplicate_option`; `chicken-burger` with no size → `option_count`,
  with two sizes → `option_count`, with three sauces → `option_count`; quantity 0 and 21 → `quantity_out_of_range`;
  a test option with delta −800 on `chicken-burger` (790) → `invalid_price` (−100 is fine: unit 690).
- Line order: an error on line 2 reports `lineIndex: 1`; with errors on lines 1 and 2, line 1's is thrown.
- `promo_invalid` for `NOPE` and for `OLD` (inactive); it comes after line errors (a bad line and a bad promo → the
  line error). Matching: `" hahn10 "` works like `HAHN10`; `""` and `undefined` mean no promo (no `promoCode` on the
  receipt, discount 0).
- The schemas refuse what §7.6 says (`schemas.test.ts`): a combo with option groups, an item with components, a combo
  without components, `minChoices > maxChoices`, `maxChoices > options.length`, a promo `value` 101 for percent, a
  lower-case code, a cart with 0 lines, quantity 21, a `VatRates` of 101. The seed menu parses unchanged.

Amounts (`amounts.test.ts`), seed menu:
- `chicken-burger` large + garlic + chili, quantity 2: unit 940, line 1880, name "Chicken Burger", `optionNames`
  `["large", "garlic", "chili"]` in the menu's group/option order (not the cart's order; `kind: "item"`).
- `itemCount`: two lines, `chicken-burger` ×2 and `burger-menu` ×1 → 3 (a combo is one item).
- `allocate` directly: `allocate(1290, [790, 350, 290])` → `[713, 316, 261]`; `allocate(50, [333, 333, 334])` →
  `[17, 16, 17]` (fractions .65, .65, .70: the .70 first, then the earlier .65); `allocate(200, [1500, 500])` →
  `[150, 50]`; `allocate(0, [1, 2])` → `[0, 0]`; `allocate(3, [0, 0])` → `[2, 1]` (all weights 0: one cent each to the
  earliest lines, round robin); `allocate(5, [1])` → `[5]`; the result always sums to `total` (also in the property
  test).
- Discounts: `HAHN10` on one line of 1255 (e.g. a test item priced 1255) → discount 126 (125.5 rounds up), total 1129;
  `HAHN10` on lines 1500 + 500 → discount 200 spread 150 / 50, each line's `discountCents`; `WELCOME3` on a subtotal of
  250 (`ayran`) → discount 250, total 0, never below 0; `WELCOME3` on 1290 → 300, total 990; the receipt's
  `promoCode` is the canonical `"HAHN10"` even when sent as `" hahn10 "`.
- `subtotalCents` = Σ line gross; `totalCents` = subtotal − discount = Σ (line gross − line discount).

VAT (`vat.test.ts`):
- `splitVat` table: gross 1 @7 → net 1, vat 0; 1 @19 → 1 / 0; 100 @7 → 93 / 7; 100 @19 → 84 / 16; 1000 @7 → 935 / 65;
  1000 @19 → 840 / 160; 1999 @7 → 1868 / 131; 1999 @19 → 1680 / 319; 1290 @7 → 1206 / 84; 1290 @19 → 1084 / 206;
  0 @19 → 0 / 0; and the half-up rule: 3 @100 → net 2, vat 1 (1.5 rounds up). Exact halves cannot occur at 7 or 19.
- **Worked example 1** (§7.4), `burger-menu` ×1, no promo: `parts` `[{ food, 7, gross 1029, net 962, vat 67 },
  { drink, 19, gross 261, net 219, vat 42 }]` (one part per category, food first); receipt subtotal 1290, discount 0,
  total 1290, `vat` `[{ 7, 1029, 962, 67 }, { 19, 261, 219, 42 }]`.
- **Worked example 2** (§7.4), `burger-menu` ×1 with `HAHN10`: discount 129, line `discountCents` 129, parts food
  925 → 864 / 61, drink 236 → 198 / 38; total 1161; `vat` `[{ 7, 925, 864, 61 }, { 19, 236, 198, 38 }]`.
- `wings-menu` ×1: allocation 599 / 323 / 268 (fractions .61 / .87 / .52: fries then cola get the two cents); parts
  food 922 → 862 / 60, drink 268 → 225 / 43.
- A combo's allocation uses the component items' standalone prices × quantities: a test combo priced 1000 of
  `fries` ×2 (700) + `cola` ×1 (290) → weights 700 / 290 → 707 / 293.
- A plain line has exactly one part at its own category; `ayran` 250 → `[{ drink, 19, 250, 210, 40 }]`.
- Summary sums parts per rate, ascending: `burger-menu` ×1 + `ayran` ×1 → total 1540, `vat`
  `[{ 7, 1029, 962, 67 }, { 19, 511, 429, 82 }]`; only rates present appear (an all-food cart has one line).
- Different rates in the menu are honoured: a menu with `vatRates { food: 10, drink: 20 }` and `ayran` 250 → net 208,
  vat 42 (25000 / 120 = 208.33).

Property test (`property.test.ts`, seeded, ~200 random valid carts over the seed menu with random promo or none):
`Σ line.discountCents = discountCents`; `totalCents = subtotalCents − discountCents`; per line
`Σ parts.gross = lineGross − discount`; `Σ vat[].gross = totalCents`; every `net + vat = gross`; `vat` sorted ascending
with unique rates; `priceCart` deterministic (same input twice → `toEqual`); it never throws for a valid cart; the
receipt parses with `ReceiptSchema`.

Orders (`transitions.test.ts`): `canTransition` true exactly for `held→paid`, `held→expired`, `held→cancelled`,
`expired→paid`, `expired→cancelled`, `paid→ready`, `paid→picked_up`, `ready→picked_up`; false for every other pair of
`ORDER_STATUSES` (loop over all 36, including `x→x`); `nextStatuses("held")` = `["paid", "expired", "cancelled"]`,
`nextStatuses("picked_up")` = `[]`, `nextStatuses("cancelled")` = `[]`.

Pickup codes (`pickupCode.test.ts`): `pickupCode(Uint8Array.of(0,1,2,3,4,5,6,7))` = `"01234567"`;
`Uint8Array.of(10,11,12,13,14,15,16,17)` = `"ABCDEFGH"`; `Uint8Array.of(18,19,20,21,22,23,24,25)` = `"JKMNPQRS"`;
`Uint8Array.of(26,27,28,29,30,31,32,255)` = `"TVWXYZ0Z"` (32 % 32 = 0, 255 % 32 = 31); 7 or 9 bytes → `RangeError`;
10 000 codes from the seeded PRNG are all distinct, all match `PickupCodeSchema`, and contain no `I`, `L`, `O`, `U`.
`normalizePickupCode(" ab-cd ef12 ")` → `"ABCDEF12"`; `"1L0O1234"` → `"11001234"` (I and L become 1, O becomes 0);
`"iIlL"` + `"oO12"` → `"11110012"`; `"ABCDEFG"` (7) → `null`; `"ABCDEFGU"` → `null` (U is not in the alphabet); `"01234567"` unchanged.

## Done means
- `pnpm --filter @slot-order/core typecheck` and `pnpm check` pass.
- `pnpm --filter @slot-order/core test`: the slot suite still green; every new test that calls a stub fails on
  `not implemented`; the schema tests may pass (the schemas are real).
- Your report: files, tests per file, the `// SPEC:` points. Nothing else.
