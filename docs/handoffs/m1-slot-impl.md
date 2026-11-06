# M1 brief: implement the slot rules against the tests

You implement the slot rules of `packages/core` so that **every test in `packages/core/test/slots/` passes**. The
tests were written first, from the spec, by another agent; they are the specification. You do not change them.

## Read first
- `docs/design.md` §3 (rows "Slot grid", "Slot rows", "Time"), **§6 in full** (§6.2 is the API contract, §6.3 the DST
  rules and the measured `TZDate` behaviour).
- `packages/core/src/schemas/slots.ts` (types and schemas), `packages/core/src/slots/index.ts` (the stubs you replace).
- Every file in `packages/core/test/slots/` and `packages/core/test/fixtures/slotConfigs.ts`.

## You own
- `packages/core/src/slots/*.ts`. Split as you see fit (e.g. `time.ts` for the timezone helpers, `grid.ts`,
  `availability.ts`, `check.ts`), with `index.ts` re-exporting the contract's functions unchanged.
- `packages/core/src/schemas/slots.ts`: **only** to add the validation the spec demands on `OpeningHoursSchema` /
  `SlotConfigSchema` (`close > open`, `"24:00"` only as a close, ranges sorted and non-overlapping). Exported names and
  types stay as they are.

## You must not
- Edit any test or fixture, any config, `package.json`, or files outside `packages/core/src/`.
- Use `Date.now()`, `new Date()` without arguments, `Intl` directly for wall-clock conversion (use `TZDate`), or any
  Node, DOM or Workers API: core's tsconfig has `types: []` and `lib: ["ES2023"]`, so the typecheck tells you.
- Add dependencies. `date-fns` 4.4.0 and `@date-fns/tz` 1.5.0 are there.

## How
- Wall clock → instant: `new TZDate(y, m, d, h, min, 0, config.timezone)` (numeric constructor **only**; `"24:00"` is
  hour 24). Instant → wall clock: wrap the instant, `new TZDate(ms, tz)`, then `format(d, "HH:mm")` or
  `"yyyy-MM-dd"` from `date-fns`. The grid is walked in **instants** (add `slotMinutes * 60_000`), never in wall time
  (§6.1, §6.3).
- Day strings are parsed with a regex into numbers; weekday from the TZDate of that day's midnight.
- Keep the reason and error orders exactly as §6.2 lists them.
- Short functions, named after the spec's terms, each with a one-line comment naming its § where that helps a reader.
- If a test contradicts the spec, or two tests contradict each other: **do not edit the test and do not bend the
  implementation to pass something you believe is wrong**. Implement the spec, let that test fail, and report the test
  name, what it expects, and what the spec says. The orchestrator decides.

## Done means
- `pnpm --filter @slot-order/core test` green (or only the contradictions above failing, each one reported).
- `pnpm --filter @slot-order/core typecheck` and `pnpm check` pass.
- Your report: the files, a few lines on how the DST days are handled, and any test you believe is wrong. Nothing else.

## Known gaps the tests already pin (from the test agent's report)
- `HHMMSchema` in `src/schemas/slots.ts` accepts `"24:01"` … `"24:59"`; only `"24:00"` may pass above `23:59`.
- `OpeningHoursSchema` lacks the rules: close after open (an empty range is refused), `"24:00"` only as a close,
  ranges sorted, non-overlapping, **touching allowed** (`[open, close)`).
- `too_many_items` compares with `config.capacityPerSlot`, not with a row's capacity (§6.2).
- The cut-off is `now > start − cutoffMinutes` (bookable at exactly `start − cutoff`); `past` is `start ≤ now`.
