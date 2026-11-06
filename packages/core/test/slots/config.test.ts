import { describe, expect, test } from "vitest";
import { type OpeningRange, type SlotConfig, SlotConfigSchema } from "../../src/index";
import { allDayConfig, cutoffConfig, seedConfig, splitConfig } from "../fixtures/slotConfigs";

// docs/design.md §5 settings, §6.2 SlotConfig: "close > open; '24:00' is allowed only as a close; a day's
// ranges are sorted and do not overlap; a day with [] is closed. The schema refuses anything else."

const parses = (config: unknown) => SlotConfigSchema.safeParse(config).success;

function withMonday(ranges: OpeningRange[]): SlotConfig {
  return { ...seedConfig, openingHours: { ...seedConfig.openingHours, mon: ranges } };
}

describe("SlotConfigSchema", () => {
  test("accepts the seed and returns it unchanged", () => {
    expect(SlotConfigSchema.parse(seedConfig)).toEqual(seedConfig);
  });

  test.each([
    ["allDayConfig", allDayConfig],
    ["cutoffConfig", cutoffConfig],
    ["splitConfig", splitConfig],
  ])("accepts %s", (_name, config) => {
    expect(parses(config)).toBe(true);
  });

  test('accepts "24:00" as a closing time', () => {
    expect(parses(withMonday([["11:00", "24:00"]]))).toBe(true);
  });

  test('refuses "24:00" as an opening time', () => {
    // Any range opening at "24:00" also fails close > open, as no close is later than "24:00".
    expect(parses(withMonday([["24:00", "24:00"]]))).toBe(false);
  });

  test("refuses a range that closes before it opens (12:00–11:00)", () => {
    expect(parses(withMonday([["12:00", "11:00"]]))).toBe(false);
  });

  test("refuses an empty range (11:00–11:00), since close must be after open", () => {
    expect(parses(withMonday([["11:00", "11:00"]]))).toBe(false);
  });

  test("refuses overlapping ranges (11:00–14:00 and 13:00–18:00)", () => {
    expect(
      parses(
        withMonday([
          ["11:00", "14:00"],
          ["13:00", "18:00"],
        ]),
      ),
    ).toBe(false);
  });

  test("refuses unsorted ranges (17:00–22:00 before 11:00–14:00)", () => {
    expect(
      parses(
        withMonday([
          ["17:00", "22:00"],
          ["11:00", "14:00"],
        ]),
      ),
    ).toBe(false);
  });

  test("accepts ranges that touch (11:00–14:00 and 14:00–18:00), since a range is [open, close)", () => {
    // SPEC: §6.2 says only that ranges "do not overlap"; with §6.1's half-open [open, close) a range
    // ending at 14:00 and one starting at 14:00 do not overlap, so this is read as allowed.
    expect(
      parses(
        withMonday([
          ["11:00", "14:00"],
          ["14:00", "18:00"],
        ]),
      ),
    ).toBe(true);
  });

  test.each<[string, OpeningRange]>([
    ['"25:00"', ["11:00", "25:00"]],
    ['"9:00" (one hour digit)', ["9:00", "22:00"]],
    ['"11:60"', ["11:00", "11:60"]],
    // SPEC: HHMMSchema's regex accepts "24:01" … "24:59"; §6.2 allows "24:00" and nothing after it.
    ['"24:30"', ["11:00", "24:30"]],
  ])("refuses the time %s", (_name, range) => {
    expect(parses(withMonday([range]))).toBe(false);
  });

  test.each<[string, Partial<SlotConfig>]>([
    ["slotMinutes: 0", { slotMinutes: 0 }],
    ["slotMinutes: 7.5", { slotMinutes: 7.5 }],
    ["prepMinutes: -1", { prepMinutes: -1 }],
    ["cutoffMinutes: -1", { cutoffMinutes: -1 }],
    ["capacityPerSlot: 0", { capacityPerSlot: 0 }],
    ["holdMinutes: 0", { holdMinutes: 0 }],
    ["maxDaysAhead: 0", { maxDaysAhead: 0 }],
  ])("refuses %s", (_name, change) => {
    expect(parses({ ...seedConfig, ...change })).toBe(false);
  });

  test("refuses opening hours without a weekday (no sun)", () => {
    const { mon, tue, wed, thu, fri, sat } = seedConfig.openingHours;

    expect(parses({ ...seedConfig, openingHours: { mon, tue, wed, thu, fri, sat } })).toBe(false);
  });
});
