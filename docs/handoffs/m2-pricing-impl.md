# M2 brief: implement pricing and orders against the tests

You implement pricing (§7), order transitions and pickup codes (§8.2, §8.3) of `packages/core` so that **every test
in `packages/core/test/pricing/` and `packages/core/test/orders/` passes**. The tests were written first, from the
spec, by another agent; they are the specification. You do not change them.

## Read first
- `docs/design.md` §3 (rows "Money", "VAT", "Capacity", "Pickup code"), **§7 in full**, §8.1–§8.3.
- `packages/core/src/schemas/{menu,cart,receipt,orders}.ts`, `src/pricing/errors.ts` (the contract: unchanged),
  `src/pricing/index.ts` and `src/orders/index.ts` (the stubs you replace).
- Every file in `packages/core/test/pricing/`, `test/orders/` and `test/fixtures/menu.ts`.

## You own
- `packages/core/src/pricing/*.ts` except `errors.ts` (split as you see fit: `validate.ts`, `allocate.ts`, `vat.ts`,
  `price.ts`; `index.ts` re-exports the §7.6 functions unchanged).
- `packages/core/src/orders/*.ts`.

## You must not
- Edit any test or fixture, any schema, `errors.ts`, any config, `package.json`, or files outside those two folders.
- Use floating point for money: every amount is an integer; rounding is `Math.floor((2 * a + b) / (2 * b))`-style
  integer arithmetic or an equivalent that cannot drift. No `Date`, no randomness, no platform APIs (`types: []`).
- Add dependencies.

## How
- Validate in the §7.2 order, per line in line order, promo last; throw `CartError(code, lineIndex)`.
- Price in the §7.3 order: unit and line gross → subtotal → discount (halves up for percent) → spread by `allocate`
  → per line the parts (§7.4: one part for an item; a combo allocated over its components' standalone values, then
  summed per category) → `splitVat` per part → the summary per rate ascending.
- `allocate`: floors, then leftover cents to the largest fractional remainders, ties to the earlier index; all weights
  zero → round robin from the first. Keep it a pure function of integers (compare remainders as `total × weight mod
  sumWeights`, no division).
- `optionNames` in the menu's group and option order. The receipt's `promoCode` is the canonical upper-case code.
- Short functions named after the spec's terms, a one-line comment naming its § where it helps a reader.
- If a test contradicts the spec, or two tests contradict each other: **do not edit the test and do not bend the
  implementation**. Implement the spec, let that test fail, and report the test name, what it expects, and what the
  spec says. The orchestrator decides.

## Done means
- `pnpm --filter @slot-order/core test` green, `test:berlin` green (the slot suite is unaffected but runs),
  `pnpm --filter @slot-order/core typecheck` and `pnpm check` pass.
- Your report: the files, a few lines on the integer rounding and the allocation, and any test you believe is wrong.

## Resolved while the tests were written (from the test agent's report)
- The brief's wings-menu numbers were wrong; the tests pin the rule's result: allocation 600 / 323 / 267, parts food
  923 → 863 / 60, drink 267 → 224 / 43. Trust the tests and §7.3, not any example in a brief.
- `allocate` with all weights 0: round robin from the first index (`allocate(3, [0, 0])` → `[2, 1]`).
- A combo's parts come food first, then drink; a combo's own `vatCategory` is ignored; a combo line is split as one
  line (quantity included in the weights' scale, not per unit).
- Validation: every check of line 1 before any check of line 2.
- A promo code that is empty **after trimming** (`"  "`) means no code. The tests do not cover it: add one test for it in
  `packages/core/test/pricing/validate.test.ts` (the only test edit you may make).
