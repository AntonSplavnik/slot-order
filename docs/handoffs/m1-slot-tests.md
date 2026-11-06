# M1 brief: the slot test suite (tests first)

You write the **tests** for the slot rules of `packages/core`. Nobody has implemented them yet: `src/slots/index.ts`
holds stubs that throw, and `src/schemas/slots.ts` holds the types and Zod schemas. Your tests are the specification
the implementer must satisfy, so they must be precise, readable and **red** when you are done.

## Read first
- `docs/design.md` §3 (rows "Slot grid", "Slot rows", "Time"), §5 `settings` and Seed, **§6 in full**, §13 row "Slots".
- `packages/core/src/schemas/slots.ts` and `packages/core/src/slots/index.ts`: the contract. Import from `../../src/index`.
- `packages/core/vitest.config.ts`: the process runs with `TZ=UTC`, as on Workers.

## You own
- `packages/core/test/fixtures/slotConfigs.ts`: exported `SlotConfig` values:
  `seedConfig` (the seed of §5: Mon–Sat `11:00–22:00`, Sun `[]`, 15-minute slots, capacity 20, prep 20, cut-off 5,
  hold 10, 7 days ahead, `Europe/Berlin`), `allDayConfig` (every day `00:00–24:00`, otherwise as seed),
  `cutoffConfig` (prep 0, cut-off 10, otherwise as seed), `splitConfig` (Mon–Sat `11:00–14:00` and `17:00–22:00`).
- `packages/core/test/slots/grid.test.ts`, `status.test.ts`, `availability.test.ts`, `check.test.ts`,
  `config.test.ts` (one file per function group; `describe` per function; test names that read as sentences).

## You must not
- Touch anything under `src/`, the configs, `package.json`, or other tests. If the contract or the spec is ambiguous,
  contradictory or missing something, **do not guess**: write the test the way the spec reads, add a `// SPEC:` comment
  on it, and list the point in your report.
- Use `Date.now()`, `new Date()` without arguments, snapshots, or randomness.

## How to build instants
- Instants: `new Date("2026-11-09T10:00:00Z")` (always with `Z`), or `Date.UTC(...)`.
- Berlin wall-clock times, where a test needs one: `new TZDate(2026, 2, 29, 2, 30, 0, "Europe/Berlin")` from
  `@date-fns/tz` (a dependency of core). **Only the numeric constructor**; never the string one.
- Compare instants with `.getTime()` or `toISOString()`; compare labels as strings.

## Facts the tests must pin (all Europe/Berlin; CET = +01:00, CEST = +02:00)
Grid (`slotGrid`):
- Seed, Mon 2026-11-09: 44 slots, first `11:00` = `2026-11-09T10:00:00Z`, last `21:45` = `2026-11-09T20:45:00Z`,
  consecutive starts 15 min apart. Sun 2026-11-08: `[]`.
- `splitConfig`, Mon 2026-11-09: 12 + 20 = 32 slots; no slot starts at `14:00` or between 14:00 and 17:00; `13:45`
  is present, `17:00` is present.
- Seed on the DST days 2026-03-29 (Sunday is closed in the seed, so use **Sat 2026-03-28 vs. Mon 2026-03-30** for the
  seed and the DST days with `allDayConfig`): `allDayConfig` 2026-03-29 → **92** slots, first
  `00:00` = `2026-03-28T23:00:00Z`, last `23:45` = `2026-03-29T21:45:00Z`; the labels go `01:30, 01:45, 03:00, 03:15`
  (no `02:xx`); every start is 15 min after the previous. `allDayConfig` 2026-10-25 → **100** slots, first
  `00:00` = `2026-10-24T22:00:00Z`, last `23:45` = `2026-10-25T22:45:00Z`; the labels `02:00 … 02:45` appear twice,
  with different instants (`2026-10-25T00:00:00Z` and `2026-10-25T01:00:00Z` both label `02:00`); no two starts share
  an instant. A normal day (`allDayConfig`, 2026-11-09) → 96 slots.
- An opening time that does not exist: a config with Sun `02:30–04:00` on 2026-03-29 opens at `03:30` CEST
  (`2026-03-29T01:30:00Z`). An ambiguous one: Sun `02:30–04:00` on 2026-10-25 opens at `02:30` **CET**
  (`2026-10-25T01:30:00Z`, the second occurrence) — pinned on purpose, see §6.3.
- A slot must end by the close: `11:00–11:20` with 15-minute slots gives one slot (`11:00`); `11:00–11:30` gives two.

Day status (`dayStatus`, `todayIn`, `dayOf`):
- `todayIn(seed, 2026-11-06T22:30:00Z)` = `2026-11-06` (23:30 Berlin); `todayIn(seed, 2026-11-06T23:30:00Z)` =
  `2026-11-07` (00:30 Berlin). `dayOf` the same for any instant.
- With now = `2026-11-06T23:30:00Z` (Sat 2026-11-07 00:30 Berlin): `2026-11-06` → `past`; `2026-11-07` … `2026-11-13`
  → `open` except `2026-11-08` (Sunday) → `closed`; `2026-11-14` → `too_far`. `closed` wins over `past` and
  `too_far` (a Sunday in the past is `closed`).

Earliest start (`earliestStart`), `allDayConfig` unless noted:
- now `2026-03-28T23:50:00Z` (00:50 CET) with prep 20 → `01:15` (`2026-03-29T00:15:00Z`).
- now `2026-03-29T00:50:00Z` (01:50 CET) with prep 20 → `03:15` CEST (`2026-03-29T01:15:00Z`): 02:xx does not exist.
- now exactly on a grid point + prep landing exactly on a grid point: now `2026-11-09T10:00:00Z` with prep 20 →
  `10:20` is not on the grid → `11:30` (`2026-11-09T10:30:00Z`); with prep 30 → `11:30` exactly.
- Seed, Mon 2026-11-09, now `2026-11-09T20:45:00Z` (21:45) → `null`; now `2026-11-09T05:00:00Z` (06:00) → `11:00`.

Availability (`listSlots`), seed, Mon 2026-11-09, now `2026-11-09T11:00:00Z` (12:00 Berlin):
- 44 entries, same order as the grid; `11:00`, `11:15`, `11:30`, `11:45` and `12:00` → `past` (`12:00` is `start ≤ now`);
  `12:15` → `too_soon` (prep 20 → earliest `12:30`); `12:30` onward `bookable: true`, no `reason`, `available: 20`.
- `cutoffConfig` (prep 0, cut-off 10), same now: `12:00` → `past`, `12:15` → `cutoff` (`now > 12:05`), `12:30` →
  bookable. Cut-off exactly: now `2026-11-09T11:05:00Z` → `12:15` bookable (`now ≤ start − cutoff`);
  one second later → `cutoff`.
- `booked` map: `{ 12:30 → { booked: 20, capacity: 20 } }` → `12:30` is `full`, `available: 0`;
  `{ 12:30 → { booked: 18, capacity: 20 } }` with `items = 3` → `full`, `available: 2`; with `items = 2` → bookable.
  A row with its own capacity: `{ 12:45 → { booked: 5, capacity: 10 } }` → `available: 5`.
- Reason precedence: a past slot that is also full reports `past`; a too-soon slot that is also full reports
  `too_soon`.
- Closed day → `[]`.

Check (`checkSlot`), seed unless noted, now `2026-11-09T11:00:00Z`, `booked` empty unless noted:
- `2026-11-08T12:00:00Z` (Sunday) → `closed_day`. `2026-11-16T11:00:00Z` (Mon next week, day 8) → `too_far`.
- `2026-11-09T11:37:00Z` (12:37, not on the grid) → `slot_not_on_grid`; `2026-11-09T11:30:00.500Z` → `slot_not_on_grid`.
- `2026-11-09T10:00:00Z` (11:00, past) → `slot_past_cutoff`; `2026-11-05T11:00:00Z` (yesterday, 12:00) →
  `slot_past_cutoff`.
- `2026-11-09T11:15:00Z` (12:15) → `slot_too_soon`.
- `2026-11-09T11:30:00Z` with `items = 21` → `too_many_items` (even with nothing booked).
- `2026-11-09T11:30:00Z` with `{ 12:30 → { booked: 19, capacity: 20 } }` and `items = 2` → `slot_full`;
  `items = 1` → `{ ok: true, slot: { start: 2026-11-09T11:30:00Z, label: "12:30" } }`.
- Order of precedence: a Sunday slot that is also too far → `closed_day`; a too-far slot off the grid → `too_far`;
  a past slot off the grid → `slot_not_on_grid`.

Hold expiry: `holdExpiry(seed, 2026-11-09T11:00:00Z)` = `2026-11-09T11:10:00Z`; it does not mutate `now`.

Config schema (`SlotConfigSchema`): the seed parses; `"24:00"` as a close parses and as an open is refused;
`["12:00","11:00"]` refused; overlapping ranges `[["11:00","14:00"],["13:00","18:00"]]` refused; unsorted ranges
refused; `"25:00"` and `"9:00"` refused; `slotMinutes: 0` refused; `prepMinutes: -1` refused.

## Done means
- `pnpm --filter @slot-order/core typecheck` passes (the tests compile against the stubs).
- `pnpm check` passes (Biome).
- `pnpm --filter @slot-order/core test` runs every test and **every slot test fails** on `not implemented`
  (the smoke test still passes).
- Your report: the files, the number of tests per file, and the list of `// SPEC:` points, if any. Nothing else.
