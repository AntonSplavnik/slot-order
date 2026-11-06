import { describe, expect, test } from "vitest";
import {
  type OpeningRange,
  type Slot,
  type SlotConfig,
  slotGrid,
  type Weekday,
} from "../../src/index";
import { allDayConfig, seedConfig, splitConfig } from "../fixtures/slotConfigs";

// docs/design.md §6.1 (grid), §6.3 (DST). Europe/Berlin: CET = +01:00, CEST = +02:00.

const MINUTE = 60_000;

/** Wall-clock "HH:MM" labels from `from` to `to`, both included, `step` minutes apart. */
function labelsFrom(from: string, to: string, step = 15): string[] {
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const labels: string[] = [];
  for (let m = minutes(from); m <= minutes(to); m += step) {
    labels.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  }
  return labels;
}

/** `count` ISO instants from `first`, `step` minutes apart. */
function instantsFrom(first: string, count: number, step = 15): string[] {
  const start = new Date(first).getTime();
  return Array.from({ length: count }, (_, i) => new Date(start + i * step * MINUTE).toISOString());
}

/** The minutes between each start and the previous one. */
function gapsInMinutes(slots: Slot[]): number[] {
  const times = slots.map((slot) => slot.start.getTime());
  return times.slice(1).map((time, i) => (time - (times[i] ?? Number.NaN)) / MINUTE);
}

const starts = (slots: Slot[]) => slots.map((slot) => slot.start.toISOString());
const labels = (slots: Slot[]) => slots.map((slot) => slot.label);
const fifteenEach = (slots: Slot[]) => Array.from({ length: slots.length - 1 }, () => 15);

function withHours(config: SlotConfig, weekday: Weekday, ranges: OpeningRange[]): SlotConfig {
  return { ...config, openingHours: { ...config.openingHours, [weekday]: ranges } };
}

describe("slotGrid", () => {
  test("gives the seed's Monday 2026-11-09 44 slots from 11:00 (10:00Z) to 21:45 (20:45Z), 15 minutes apart", () => {
    const grid = slotGrid(seedConfig, "2026-11-09");

    expect(grid).toHaveLength(44);
    expect(grid[0]?.start.toISOString()).toBe("2026-11-09T10:00:00.000Z");
    expect(grid[0]?.label).toBe("11:00");
    expect(grid.at(-1)?.start.toISOString()).toBe("2026-11-09T20:45:00.000Z");
    expect(grid.at(-1)?.label).toBe("21:45");
    expect(starts(grid)).toEqual(instantsFrom("2026-11-09T10:00:00Z", 44));
    expect(labels(grid)).toEqual(labelsFrom("11:00", "21:45"));
  });

  test.each([
    ["Tue", "2026-11-10"],
    ["Wed", "2026-11-11"],
    ["Thu", "2026-11-12"],
    ["Fri", "2026-11-13"],
    ["Sat", "2026-11-14"],
  ])("gives the seed's %s %s the same 44 slots from 11:00 to 21:45", (_weekday, day) => {
    const grid = slotGrid(seedConfig, day);

    expect(starts(grid)).toEqual(instantsFrom(`${day}T10:00:00Z`, 44));
    expect(labels(grid)).toEqual(labelsFrom("11:00", "21:45"));
  });

  test("gives the seed's Sunday 2026-11-08 no slots, because Sunday has no opening ranges", () => {
    expect(slotGrid(seedConfig, "2026-11-08")).toEqual([]);
  });

  test("gives splitConfig's Monday 12 lunch slots and 20 evening slots, 32 in all", () => {
    const grid = slotGrid(splitConfig, "2026-11-09");

    expect(grid).toHaveLength(32);
    expect(starts(grid)).toEqual([
      ...instantsFrom("2026-11-09T10:00:00Z", 12),
      ...instantsFrom("2026-11-09T16:00:00Z", 20),
    ]);
    expect(labels(grid)).toEqual([
      ...labelsFrom("11:00", "13:45"),
      ...labelsFrom("17:00", "21:45"),
    ]);
  });

  test("has no splitConfig slot starting at 14:00 or during the break, but has 13:45 and 17:00", () => {
    const grid = slotGrid(splitConfig, "2026-11-09");
    const breakStart = new Date("2026-11-09T13:00:00Z").getTime(); // 14:00 Berlin
    const breakEnd = new Date("2026-11-09T16:00:00Z").getTime(); // 17:00 Berlin

    expect(
      grid.filter((slot) => slot.start.getTime() >= breakStart && slot.start.getTime() < breakEnd),
    ).toEqual([]);
    expect(labels(grid)).not.toContain("14:00");
    expect(starts(grid)).toContain("2026-11-09T12:45:00.000Z");
    expect(labels(grid)).toContain("13:45");
    expect(starts(grid)).toContain("2026-11-09T16:00:00.000Z");
    expect(labels(grid)).toContain("17:00");
  });

  test("ends every slot by the close: 11:00–11:20 with 15-minute slots gives only 11:00", () => {
    const config = withHours(seedConfig, "mon", [["11:00", "11:20"]]);
    const grid = slotGrid(config, "2026-11-09");

    expect(starts(grid)).toEqual(["2026-11-09T10:00:00.000Z"]);
    expect(labels(grid)).toEqual(["11:00"]);
  });

  test("fits two 15-minute slots into 11:00–11:30: 11:00 and 11:15", () => {
    const config = withHours(seedConfig, "mon", [["11:00", "11:30"]]);
    const grid = slotGrid(config, "2026-11-09");

    expect(starts(grid)).toEqual(["2026-11-09T10:00:00.000Z", "2026-11-09T10:15:00.000Z"]);
    expect(labels(grid)).toEqual(["11:00", "11:15"]);
  });

  test("walks slotMinutes: 30-minute slots give the seed's Monday 22 slots from 11:00 to 21:30", () => {
    const grid = slotGrid({ ...seedConfig, slotMinutes: 30 }, "2026-11-09");

    expect(starts(grid)).toEqual(instantsFrom("2026-11-09T10:00:00Z", 22, 30));
    expect(labels(grid)).toEqual(labelsFrom("11:00", "21:30", 30));
  });

  test("gives allDayConfig an ordinary day (2026-11-09) 96 slots from 00:00 to 23:45", () => {
    const grid = slotGrid(allDayConfig, "2026-11-09");

    expect(grid).toHaveLength(96);
    expect(starts(grid)).toEqual(instantsFrom("2026-11-08T23:00:00Z", 96));
    expect(labels(grid)).toEqual(labelsFrom("00:00", "23:45"));
  });

  test('reads "24:00" as the next midnight: the last slot of 2026-11-09 ends at 2026-11-09T23:00Z', () => {
    const last = slotGrid(allDayConfig, "2026-11-09").at(-1);

    expect(last?.start.toISOString()).toBe("2026-11-09T22:45:00.000Z");
    expect(new Date((last?.start.getTime() ?? Number.NaN) + 15 * MINUTE).toISOString()).toBe(
      "2026-11-09T23:00:00.000Z",
    );
  });

  describe("on the DST days", () => {
    // SPEC: §6.3 says that "with the seed hours (11:00–22:00) both days have 44 slots", but both DST days
    // (2026-03-29, 2026-10-25) are Sundays, which the seed closes. Per the brief, the seed is tested on the
    // Saturday before and the Monday after each change; the next test gives Sunday the seed hours to pin
    // §6.3's sentence as written.
    test.each([
      ["Sat 2026-03-28 (CET)", "2026-03-28", "2026-03-28T10:00:00Z"],
      ["Mon 2026-03-30 (CEST)", "2026-03-30", "2026-03-30T09:00:00Z"],
      ["Sat 2026-10-24 (CEST)", "2026-10-24", "2026-10-24T09:00:00Z"],
      ["Mon 2026-10-26 (CET)", "2026-10-26", "2026-10-26T10:00:00Z"],
    ])(
      "gives the seed on %s 44 slots labelled 11:00 to 21:45, 15 minutes apart",
      (_name, day, first) => {
        const grid = slotGrid(seedConfig, day);

        expect(grid).toHaveLength(44);
        expect(starts(grid)).toEqual(instantsFrom(first, 44));
        expect(labels(grid)).toEqual(labelsFrom("11:00", "21:45"));
      },
    );

    test.each([
      ["2026-03-29 (CEST all day)", "2026-03-29", "2026-03-29T09:00:00Z"],
      ["2026-10-25 (CET all day)", "2026-10-25", "2026-10-25T10:00:00Z"],
    ])("gives seed hours on Sunday %s 44 slots labelled 11:00 to 21:45", (_name, day, first) => {
      // SPEC: see above; §6.3's "seed hours" sentence, with Sunday opened 11:00–22:00.
      const grid = slotGrid(withHours(seedConfig, "sun", [["11:00", "22:00"]]), day);

      expect(grid).toHaveLength(44);
      expect(starts(grid)).toEqual(instantsFrom(first, 44));
      expect(labels(grid)).toEqual(labelsFrom("11:00", "21:45"));
    });

    test("gives allDayConfig 92 slots on 2026-03-29, from 00:00 (2026-03-28T23:00Z) to 23:45 (2026-03-29T21:45Z)", () => {
      const grid = slotGrid(allDayConfig, "2026-03-29");

      expect(grid).toHaveLength(92);
      expect(grid[0]?.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
      expect(grid[0]?.label).toBe("00:00");
      expect(grid.at(-1)?.start.toISOString()).toBe("2026-03-29T21:45:00.000Z");
      expect(grid.at(-1)?.label).toBe("23:45");
    });

    test("skips the hour that does not exist on 2026-03-29: 01:30, 01:45, 03:00, 03:15 and no 02:xx", () => {
      const grid = slotGrid(allDayConfig, "2026-03-29");
      const at0130 = labels(grid).indexOf("01:30");

      expect(labels(grid).slice(at0130, at0130 + 4)).toEqual(["01:30", "01:45", "03:00", "03:15"]);
      expect(labels(grid).filter((label) => label.startsWith("02:"))).toEqual([]);
      expect(labels(grid)).toEqual([
        ...labelsFrom("00:00", "01:45"),
        ...labelsFrom("03:00", "23:45"),
      ]);
    });

    test("starts every slot on 2026-03-29 exactly 15 minutes after the previous one", () => {
      const grid = slotGrid(allDayConfig, "2026-03-29");

      expect(gapsInMinutes(grid)).toEqual(fifteenEach(grid));
      expect(starts(grid)).toEqual(instantsFrom("2026-03-28T23:00:00Z", 92));
    });

    test("gives allDayConfig 100 slots on 2026-10-25, from 00:00 (2026-10-24T22:00Z) to 23:45 (2026-10-25T22:45Z)", () => {
      const grid = slotGrid(allDayConfig, "2026-10-25");

      expect(grid).toHaveLength(100);
      expect(grid[0]?.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
      expect(grid[0]?.label).toBe("00:00");
      expect(grid.at(-1)?.start.toISOString()).toBe("2026-10-25T22:45:00.000Z");
      expect(grid.at(-1)?.label).toBe("23:45");
    });

    test("labels 02:00 to 02:45 twice on 2026-10-25, as different instants", () => {
      const grid = slotGrid(allDayConfig, "2026-10-25");

      expect(labels(grid)).toEqual([
        ...labelsFrom("00:00", "02:45"),
        ...labelsFrom("02:00", "02:45"),
        ...labelsFrom("03:00", "23:45"),
      ]);
      expect(
        grid.filter((slot) => slot.label === "02:00").map((slot) => slot.start.toISOString()),
      ).toEqual(["2026-10-25T00:00:00.000Z", "2026-10-25T01:00:00.000Z"]);
    });

    test("never repeats an instant on 2026-10-25 and starts each slot 15 minutes after the previous one", () => {
      const grid = slotGrid(allDayConfig, "2026-10-25");

      expect(new Set(starts(grid)).size).toBe(100);
      expect(gapsInMinutes(grid)).toEqual(fifteenEach(grid));
      expect(starts(grid)).toEqual(instantsFrom("2026-10-24T22:00:00Z", 100));
    });

    test("moves an opening time that does not exist forward: Sun 02:30–04:00 on 2026-03-29 opens at 03:30 CEST", () => {
      const grid = slotGrid(withHours(seedConfig, "sun", [["02:30", "04:00"]]), "2026-03-29");

      expect(grid[0]?.start.toISOString()).toBe("2026-03-29T01:30:00.000Z");
      expect(grid[0]?.label).toBe("03:30");
      expect(starts(grid)).toEqual(["2026-03-29T01:30:00.000Z", "2026-03-29T01:45:00.000Z"]);
      expect(labels(grid)).toEqual(["03:30", "03:45"]);
    });

    test("opens an ambiguous opening time at its second occurrence: Sun 02:30–04:00 on 2026-10-25 opens at 02:30 CET", () => {
      // Pinned on purpose (§6.3): measured with @date-fns/tz 1.5.0, so a library change is noticed.
      const grid = slotGrid(withHours(seedConfig, "sun", [["02:30", "04:00"]]), "2026-10-25");

      expect(grid[0]?.start.toISOString()).toBe("2026-10-25T01:30:00.000Z");
      expect(grid[0]?.label).toBe("02:30");
      expect(starts(grid)).toEqual(instantsFrom("2026-10-25T01:30:00Z", 6));
      expect(labels(grid)).toEqual(labelsFrom("02:30", "03:45"));
    });
  });
});
