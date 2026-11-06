import { describe, expect, test } from "vitest";
import {
  type Booked,
  checkSlot,
  holdExpiry,
  type SlotCheck,
  type SlotConfig,
} from "../../src/index";
import { allDayConfig, cutoffConfig, seedConfig, splitConfig } from "../fixtures/slotConfigs";

// docs/design.md §6.1, §6.2 (checkSlot: the first error in the order of §6.2; holdExpiry).
// Unless noted: the seed, now = Mon 2026-11-09 12:00 Berlin (11:00Z), nothing booked, 1 item.
// Europe/Berlin: CET = +01:00, CEST = +02:00.

/** Mon 2026-11-09 12:00 Berlin. */
const NOON = new Date("2026-11-09T11:00:00Z");
const NOTHING_BOOKED: Booked = new Map();

/** A `Booked` map from ISO instants (the key is `start.getTime()`). */
function booked(rows: Record<string, { booked: number; capacity: number }>): Booked {
  return new Map(Object.entries(rows).map(([iso, usage]) => [new Date(iso).getTime(), usage]));
}

/** A check as plain data, the slot's instant as an ISO string. */
function plain(check: SlotCheck) {
  return check.ok
    ? { ok: true, slot: { start: check.slot.start.toISOString(), label: check.slot.label } }
    : check;
}

/** `checkSlot` with the defaults above. */
function check(
  start: string,
  {
    items = 1,
    now = NOON,
    rows = NOTHING_BOOKED,
    config = seedConfig,
  }: { items?: number; now?: Date; rows?: Booked; config?: SlotConfig } = {},
) {
  return plain(checkSlot(config, new Date(start), items, now, rows));
}

const refused = (code: string) => ({ ok: false, code });
const accepted = (start: string, label: string) => ({ ok: true, slot: { start, label } });

describe("checkSlot", () => {
  test("accepts a bookable slot and returns its instant and label: 12:30 for 1 item", () => {
    expect(check("2026-11-09T11:30:00Z")).toEqual(accepted("2026-11-09T11:30:00.000Z", "12:30"));
  });

  describe("closed_day", () => {
    test("refuses a slot on Sunday 2026-11-08 (13:00 Berlin)", () => {
      expect(check("2026-11-08T12:00:00Z")).toEqual(refused("closed_day"));
    });

    test("takes the day of start in Berlin: 2026-11-07T23:30Z is Sunday 00:30 there", () => {
      expect(check("2026-11-07T23:30:00Z")).toEqual(refused("closed_day"));
    });

    test("takes the day of start in Berlin: 2026-11-08T23:30Z is Monday 00:30 there, so it is not closed_day but off the grid", () => {
      expect(check("2026-11-08T23:30:00Z")).toEqual(refused("slot_not_on_grid"));
    });
  });

  describe("too_far", () => {
    test("refuses a slot on day 8 of the horizon (Mon 2026-11-16 12:00)", () => {
      expect(check("2026-11-16T11:00:00Z")).toEqual(refused("too_far"));
    });

    test("accepts a slot on Sat 2026-11-14 21:45, the last open day of the horizon", () => {
      expect(check("2026-11-14T20:45:00Z")).toEqual(accepted("2026-11-14T20:45:00.000Z", "21:45"));
    });
  });

  describe("slot_not_on_grid", () => {
    test("refuses an instant between two grid points (12:37)", () => {
      expect(check("2026-11-09T11:37:00Z")).toEqual(refused("slot_not_on_grid"));
    });

    test("refuses an instant half a second after a grid point (12:30:00.500)", () => {
      expect(check("2026-11-09T11:30:00.500Z")).toEqual(refused("slot_not_on_grid"));
    });

    test("refuses a quarter hour before opening (06:00)", () => {
      expect(check("2026-11-09T05:00:00Z")).toEqual(refused("slot_not_on_grid"));
    });

    test("refuses the close itself (22:00), since a slot there would end after it", () => {
      expect(check("2026-11-09T21:00:00Z")).toEqual(refused("slot_not_on_grid"));
    });

    test("refuses a start in splitConfig's lunch break (14:00)", () => {
      expect(check("2026-11-09T13:00:00Z", { config: splitConfig })).toEqual(
        refused("slot_not_on_grid"),
      );
    });
  });

  describe("slot_past_cutoff", () => {
    test("refuses a past slot (11:00)", () => {
      expect(check("2026-11-09T10:00:00Z")).toEqual(refused("slot_past_cutoff"));
    });

    test("refuses the slot that starts at now (12:00)", () => {
      expect(check("2026-11-09T11:00:00Z")).toEqual(refused("slot_past_cutoff"));
    });

    test("refuses a slot on an earlier day (Thu 2026-11-05 12:00)", () => {
      // SPEC: the brief calls 2026-11-05 "yesterday"; it is the Thursday before. The real yesterday,
      // Sun 2026-11-08, is closed and answers closed_day (tested above).
      expect(check("2026-11-05T11:00:00Z")).toEqual(refused("slot_past_cutoff"));
    });

    test("refuses a future slot inside the cut-off: at 12:12, 12:15 (cut-off 12:10) although it is also too soon", () => {
      expect(check("2026-11-09T11:15:00Z", { now: new Date("2026-11-09T11:12:00Z") })).toEqual(
        refused("slot_past_cutoff"),
      );
    });

    test("accepts 12:15 at exactly start − cutoff with cutoffConfig (now 12:05)", () => {
      expect(
        check("2026-11-09T11:15:00Z", {
          config: cutoffConfig,
          now: new Date("2026-11-09T11:05:00Z"),
        }),
      ).toEqual(accepted("2026-11-09T11:15:00.000Z", "12:15"));
    });

    test("refuses the slot that starts at now even with cut-off 0 and prep 0, and accepts the next one", () => {
      // §6.2: slot_past_cutoff is `start ≤ now` or `now > start − cutoffMinutes`, as listSlots' past.
      const config = { ...seedConfig, prepMinutes: 0, cutoffMinutes: 0 };

      expect(check("2026-11-09T11:00:00Z", { config })).toEqual(refused("slot_past_cutoff"));
      expect(check("2026-11-09T11:15:00Z", { config })).toEqual(
        accepted("2026-11-09T11:15:00.000Z", "12:15"),
      );
    });

    test("refuses 12:15 one second after start − cutoff with cutoffConfig (now 12:05:01)", () => {
      expect(
        check("2026-11-09T11:15:00Z", {
          config: cutoffConfig,
          now: new Date("2026-11-09T11:05:01Z"),
        }),
      ).toEqual(refused("slot_past_cutoff"));
    });
  });

  describe("slot_too_soon", () => {
    test("refuses 12:15, because prep 20 puts the earliest start at 12:30", () => {
      expect(check("2026-11-09T11:15:00Z")).toEqual(refused("slot_too_soon"));
    });
  });

  describe("too_many_items", () => {
    test("refuses 21 items, more than capacityPerSlot, even with nothing booked", () => {
      expect(check("2026-11-09T11:30:00Z", { items: 21 })).toEqual(refused("too_many_items"));
    });

    test("accepts exactly capacityPerSlot (20) items in an empty slot", () => {
      expect(check("2026-11-09T11:30:00Z", { items: 20 })).toEqual(
        accepted("2026-11-09T11:30:00.000Z", "12:30"),
      );
    });

    test("compares with capacityPerSlot, not with the row's capacity: 21 items into a row of 30", () => {
      // SPEC: §6.2 defines too_many_items as `items > capacityPerSlot` ("can never fit"). A row created
      // before capacityPerSlot was lowered could still fit them; the test follows the definition.
      const rows = booked({ "2026-11-09T11:30:00Z": { booked: 0, capacity: 30 } });

      expect(check("2026-11-09T11:30:00Z", { items: 21, rows })).toEqual(refused("too_many_items"));
    });
  });

  describe("slot_full", () => {
    const nineteenOfTwenty = booked({ "2026-11-09T11:30:00Z": { booked: 19, capacity: 20 } });

    test("refuses 2 items when 19 of 20 are booked", () => {
      expect(check("2026-11-09T11:30:00Z", { items: 2, rows: nineteenOfTwenty })).toEqual(
        refused("slot_full"),
      );
    });

    test("accepts 1 item when 19 of 20 are booked", () => {
      expect(check("2026-11-09T11:30:00Z", { items: 1, rows: nineteenOfTwenty })).toEqual(
        accepted("2026-11-09T11:30:00.000Z", "12:30"),
      );
    });

    test("uses the row's own capacity: with 5 of 10 booked it refuses 6 items and accepts 5", () => {
      const rows = booked({ "2026-11-09T11:30:00Z": { booked: 5, capacity: 10 } });

      expect(check("2026-11-09T11:30:00Z", { items: 6, rows })).toEqual(refused("slot_full"));
      expect(check("2026-11-09T11:30:00Z", { items: 5, rows })).toEqual(
        accepted("2026-11-09T11:30:00.000Z", "12:30"),
      );
    });
  });

  describe("on the DST days (allDayConfig)", () => {
    test("accepts both 02:00 slots of 2026-10-25 as different slots", () => {
      const now = new Date("2026-10-24T12:00:00Z");

      expect(check("2026-10-25T00:00:00Z", { config: allDayConfig, now })).toEqual(
        accepted("2026-10-25T00:00:00.000Z", "02:00"),
      );
      expect(check("2026-10-25T01:00:00Z", { config: allDayConfig, now })).toEqual(
        accepted("2026-10-25T01:00:00.000Z", "02:00"),
      );
    });

    test("accepts 03:00 CEST on 2026-03-29, the slot right after the missing hour", () => {
      const now = new Date("2026-03-28T12:00:00Z");

      expect(check("2026-03-29T01:00:00Z", { config: allDayConfig, now })).toEqual(
        accepted("2026-03-29T01:00:00.000Z", "03:00"),
      );
    });
  });

  describe("reports the first error that applies", () => {
    test("closed_day before too_far: a Sunday beyond the horizon (2026-11-22)", () => {
      expect(check("2026-11-22T11:00:00Z")).toEqual(refused("closed_day"));
    });

    test("closed_day before slot_not_on_grid: a Sunday instant off the grid (2026-11-08 12:37)", () => {
      expect(check("2026-11-08T11:37:00Z")).toEqual(refused("closed_day"));
    });

    test("too_far before slot_not_on_grid: an instant off the grid on day 8 (2026-11-16 12:37)", () => {
      expect(check("2026-11-16T11:37:00Z")).toEqual(refused("too_far"));
    });

    test("slot_not_on_grid before slot_past_cutoff: a past instant off the grid (11:07)", () => {
      expect(check("2026-11-09T10:07:00Z")).toEqual(refused("slot_not_on_grid"));
    });

    test("slot_past_cutoff before slot_full: a past slot that is full", () => {
      const rows = booked({ "2026-11-09T10:00:00Z": { booked: 20, capacity: 20 } });

      expect(check("2026-11-09T10:00:00Z", { rows })).toEqual(refused("slot_past_cutoff"));
    });

    test("slot_too_soon before too_many_items: 12:15 for 21 items", () => {
      expect(check("2026-11-09T11:15:00Z", { items: 21 })).toEqual(refused("slot_too_soon"));
    });

    test("too_many_items before slot_full: 21 items for a full slot", () => {
      const rows = booked({ "2026-11-09T11:30:00Z": { booked: 20, capacity: 20 } });

      expect(check("2026-11-09T11:30:00Z", { items: 21, rows })).toEqual(refused("too_many_items"));
    });
  });
});

describe("holdExpiry", () => {
  test("is now + holdMinutes: 2026-11-09T11:00Z gives 11:10Z with the seed", () => {
    expect(holdExpiry(seedConfig, new Date("2026-11-09T11:00:00Z")).toISOString()).toBe(
      "2026-11-09T11:10:00.000Z",
    );
  });

  test("follows holdMinutes: 15 minutes give 11:15Z", () => {
    expect(
      holdExpiry(
        { ...seedConfig, holdMinutes: 15 },
        new Date("2026-11-09T11:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-09T11:15:00.000Z");
  });

  test("does not mutate now", () => {
    const now = new Date("2026-11-09T11:00:00Z");

    holdExpiry(seedConfig, now);

    expect(now.toISOString()).toBe("2026-11-09T11:00:00.000Z");
  });
});
