import { type DayStatus, DayStringSchema, type SlotReason } from "@slot-order/core";
import { afterEach, describe, expect, test } from "vitest";
import { chip, dayLabel, dayStatusText, dayStrip } from "../src/lib/slots";

// docs/design.md §11.1 `/checkout` (a day strip of today and the next 6 days, each day's status labelled;
// the day's slots as chips, the non-bookable ones disabled with their reason as a hint) and §11.2
// `slots.ts`. The day is always an argument (no real clock); today is Monday 2026-11-09.

const TODAY = "2026-11-09";

describe("dayStrip: today and the next days − 1 calendar days (§11.2)", () => {
  test("seven days by default: 2026-11-09 … 2026-11-15", () => {
    expect(dayStrip(TODAY)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });

  test("across the month end: 2026-11-28 … 2026-12-04", () => {
    expect(dayStrip("2026-11-28")).toEqual([
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
    ]);
  });

  test("across the year end: 2026-12-30 … 2027-01-05", () => {
    expect(dayStrip("2026-12-30")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
      "2027-01-04",
      "2027-01-05",
    ]);
  });

  test("across Berlin's DST end (25 Oct 2026): seven distinct days", () => {
    expect(dayStrip("2026-10-23")).toEqual([
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
    ]);
  });

  test("a leap day: 2028-02-28 → 2028-02-29 → 2028-03-01", () => {
    expect(dayStrip("2028-02-28", 3)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  test("days = 1 → [today]; days = 3 → three days", () => {
    expect(dayStrip(TODAY, 1)).toEqual([TODAY]);
    expect(dayStrip(TODAY, 3)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  test("every entry is a DayString", () => {
    for (const day of dayStrip("2026-12-30")) expect(DayStringSchema.parse(day)).toBe(day);
  });
});

describe("chip: a slot's label, disabled with a hint when not bookable (§11.1, §11.2)", () => {
  const slot = { start: "2026-11-09T11:30:00.000Z", label: "12:30", available: 20 };

  test("a bookable slot: its label, enabled, no hint", () => {
    expect(chip({ ...slot, bookable: true })).toEqual({
      label: "12:30",
      disabled: false,
      hint: null,
    });
  });

  test("the label is the slot's own", () => {
    expect(chip({ ...slot, label: "18:45", bookable: true }).label).toBe("18:45");
  });

  test.each<[SlotReason, string]>([
    ["past", "Already started"],
    ["cutoff", "Too late to order"],
    ["too_soon", "Too soon"],
    ["full", "Full"],
  ])("reason %s → disabled, hint %j", (reason, hint) => {
    expect(chip({ ...slot, available: 0, bookable: false, reason })).toEqual({
      label: "12:30",
      disabled: true,
      hint,
    });
  });

  // SPEC: §10.1 makes `reason` optional and §11.2 maps only the four reasons. Decision: a slot that is
  // not bookable and has no reason is disabled without a hint.
  test("not bookable without a reason → disabled, hint null", () => {
    expect(chip({ ...slot, bookable: false })).toEqual({
      label: "12:30",
      disabled: true,
      hint: null,
    });
  });
});

describe('dayLabel: "Today", "Tomorrow", else like "Wed 11 Nov" (§11.2)', () => {
  test.each<[string, string, string]>([
    ["2026-11-09", TODAY, "Today"],
    ["2026-11-10", TODAY, "Tomorrow"],
    ["2026-11-11", TODAY, "Wed 11 Nov"],
    ["2026-11-15", TODAY, "Sun 15 Nov"],
    ["2026-12-01", TODAY, "Tue 1 Dec"],
    ["2026-11-08", TODAY, "Sun 8 Nov"],
    ["2026-12-01", "2026-11-30", "Tomorrow"],
    ["2027-01-01", "2026-12-31", "Tomorrow"],
  ])("dayLabel(%s, today %s) → %j", (day, today, label) => {
    expect(dayLabel(day, today)).toBe(label);
  });

  // SPEC: §11.2's example has no year. Decision: the year is never shown, also across the year end
  // (the strip spans seven days).
  test('across the year end the year is not shown: 2027-01-02 → "Sat 2 Jan"', () => {
    expect(dayLabel("2027-01-02", "2026-12-31")).toBe("Sat 2 Jan");
  });
});

describe("dayLabel and dayStrip never depend on the process time zone (§11.2)", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  // Node applies a changed TZ at once; at UTC−10 `new Date("2026-11-11")` is still Tuesday locally,
  // at UTC+14 a local-midnight date is the previous day in UTC.
  test.each(["Pacific/Honolulu", "Pacific/Kiritimati"])(
    "in %s the labels and days are the same",
    (tz) => {
      process.env.TZ = tz;
      expect(dayLabel("2026-11-11", TODAY)).toBe("Wed 11 Nov");
      expect(dayLabel("2026-12-01", TODAY)).toBe("Tue 1 Dec");
      expect(dayLabel("2026-11-10", TODAY)).toBe("Tomorrow");
      expect(dayStrip("2026-10-24", 3)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
      expect(dayStrip("2026-12-31", 2)).toEqual(["2026-12-31", "2027-01-01"]);
    },
  );
});

describe("dayStatusText (§11.1, §11.2)", () => {
  test.each<[DayStatus, string]>([
    ["closed", "Closed"],
    ["past", "Past"],
    ["too_far", "Not yet"],
    ["open", ""],
  ])("%s → %j", (status, text) => {
    expect(dayStatusText(status)).toBe(text);
  });
});
