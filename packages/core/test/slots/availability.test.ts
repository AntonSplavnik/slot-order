import { describe, expect, test } from "vitest";
import {
  type Booked,
  earliestStart,
  listSlots,
  type SlotAvailability,
  type SlotReason,
  slotGrid,
} from "../../src/index";
import { allDayConfig, cutoffConfig, seedConfig } from "../fixtures/slotConfigs";

// docs/design.md §6.1 (earliest start, cut-off, available, bookable), §6.2 (earliestStart, listSlots),
// §6.3 (earliest start across the DST gap). Europe/Berlin: CET = +01:00, CEST = +02:00.

const MINUTE = 60_000;
const MONDAY = "2026-11-09";
/** Mon 2026-11-09 12:00 Berlin. */
const NOON = new Date("2026-11-09T11:00:00Z");
const NOTHING_BOOKED: Booked = new Map();

/** A `Booked` map from ISO instants (the key is `start.getTime()`). */
function booked(rows: Record<string, { booked: number; capacity: number }>): Booked {
  return new Map(Object.entries(rows).map(([iso, usage]) => [new Date(iso).getTime(), usage]));
}

/** A slot as plain data, its instant as an ISO string. */
function view(slot: SlotAvailability | undefined) {
  return slot === undefined
    ? undefined
    : {
        start: slot.start.toISOString(),
        label: slot.label,
        available: slot.available,
        bookable: slot.bookable,
        reason: slot.reason,
      };
}

function slotLabelled(slots: SlotAvailability[], label: string) {
  return view(slots.find((slot) => slot.label === label));
}

/** The expected view of the seed's Monday slot at `label` ("HH:MM" CET), from its instant. */
function expected(
  label: string,
  available: number,
  reason?: SlotReason,
): { start: string; label: string; available: number; bookable: boolean; reason?: SlotReason } {
  const [hours, minutes] = label.split(":").map(Number);
  const start = new Date(Date.UTC(2026, 10, 9, (hours ?? Number.NaN) - 1, minutes)).toISOString();
  return reason === undefined
    ? { start, label, available, bookable: true }
    : { start, label, available, bookable: false, reason };
}

describe("earliestStart", () => {
  test("is 01:15 (2026-03-29T00:15Z) at 00:50 CET on 2026-03-29 with prep 20", () => {
    const now = new Date("2026-03-28T23:50:00Z");

    expect(earliestStart(allDayConfig, "2026-03-29", now)?.toISOString()).toBe(
      "2026-03-29T00:15:00.000Z",
    );
  });

  test("jumps the missing hour: at 01:50 CET on 2026-03-29 with prep 20 it is 03:15 CEST (2026-03-29T01:15Z)", () => {
    const now = new Date("2026-03-29T00:50:00Z");

    expect(earliestStart(allDayConfig, "2026-03-29", now)?.toISOString()).toBe(
      "2026-03-29T01:15:00.000Z",
    );
  });

  test("rounds up to the next slot start: at 11:00 with prep 20 (11:20, mid-slot) it is 11:30", () => {
    const now = new Date("2026-11-09T10:00:00Z");

    expect(earliestStart(allDayConfig, MONDAY, now)?.toISOString()).toBe(
      "2026-11-09T10:30:00.000Z",
    );
  });

  test("takes the slot that now + prep lands on exactly: at 11:00 with prep 30 it is 11:30", () => {
    const now = new Date("2026-11-09T10:00:00Z");

    expect(earliestStart({ ...allDayConfig, prepMinutes: 30 }, MONDAY, now)?.toISOString()).toBe(
      "2026-11-09T10:30:00.000Z",
    );
  });

  test("is null when the day has no slot left: the seed's Monday at 21:45", () => {
    expect(earliestStart(seedConfig, MONDAY, new Date("2026-11-09T20:45:00Z"))).toBeNull();
  });

  test("is the day's first slot before opening: the seed's Monday at 06:00 gives 11:00", () => {
    expect(earliestStart(seedConfig, MONDAY, new Date("2026-11-09T05:00:00Z"))?.toISOString()).toBe(
      "2026-11-09T10:00:00.000Z",
    );
  });

  test("is the day's first slot for a later day: Tue 2026-11-10 seen from Monday noon gives 11:00", () => {
    expect(earliestStart(seedConfig, "2026-11-10", NOON)?.toISOString()).toBe(
      "2026-11-10T10:00:00.000Z",
    );
  });

  test("is null for an earlier day: Fri 2026-11-06 seen from Monday noon", () => {
    expect(earliestStart(seedConfig, "2026-11-06", NOON)).toBeNull();
  });

  test("is null for a closed day: Sun 2026-11-08", () => {
    expect(earliestStart(seedConfig, "2026-11-08", new Date("2026-11-07T05:00:00Z"))).toBeNull();
  });
});

describe("listSlots", () => {
  describe("for the seed's Monday 2026-11-09 at 12:00 Berlin, nothing booked", () => {
    const slots = () => listSlots(seedConfig, MONDAY, NOON, NOTHING_BOOKED);

    test("lists all 44 slots of the grid, in the grid's order", () => {
      const list = slots();

      expect(list).toHaveLength(44);
      expect(list.map((slot) => slot.start.toISOString())).toEqual(
        Array.from({ length: 44 }, (_, i) =>
          new Date(Date.UTC(2026, 10, 9, 10, 0) + i * 15 * MINUTE).toISOString(),
        ),
      );
      expect(list.map((slot) => slot.start.toISOString())).toEqual(
        slotGrid(seedConfig, MONDAY).map((slot) => slot.start.toISOString()),
      );
      expect(list.map((slot) => slot.label)).toEqual(
        slotGrid(seedConfig, MONDAY).map((slot) => slot.label),
      );
    });

    test("marks 11:00 to 12:00 as past, 12:00 because it starts exactly at now", () => {
      expect(slots().slice(0, 5).map(view)).toEqual([
        expected("11:00", 20, "past"),
        expected("11:15", 20, "past"),
        expected("11:30", 20, "past"),
        expected("11:45", 20, "past"),
        expected("12:00", 20, "past"),
      ]);
    });

    test("marks 12:15 as too_soon, because prep 20 puts the earliest start at 12:30", () => {
      expect(slotLabelled(slots(), "12:15")).toEqual(expected("12:15", 20, "too_soon"));
    });

    test("makes every slot from 12:30 on bookable, with 20 available and no reason", () => {
      const list = slots();
      const fromHalfPast = list.slice(6);

      expect(list[6]?.label).toBe("12:30");
      expect(fromHalfPast.map(view)).toEqual(fromHalfPast.map((slot) => expected(slot.label, 20)));
      expect(fromHalfPast.map((slot) => slot.reason)).toEqual(fromHalfPast.map(() => undefined));
    });
  });

  describe("with prep 0 and cut-off 10 (cutoffConfig)", () => {
    test("at 12:00 marks 12:00 as past and keeps 12:15 bookable, since 12:00 is not after its cut-off 12:05", () => {
      // SPEC: the brief expects 12:15 → cutoff at now 12:00 ("now > 12:05"), but 12:00 is not after 12:05;
      // by §6.1 (orderable while now <= start − cutoff) and the brief's own "cut-off exactly" case
      // (12:15 bookable at 12:05), 12:15 is bookable at 12:00. The test follows §6.1; the past / cutoff /
      // bookable trio the brief meant is pinned at 12:06 in the next test.
      const list = listSlots(cutoffConfig, MONDAY, NOON, NOTHING_BOOKED);

      expect(slotLabelled(list, "11:45")).toEqual(expected("11:45", 20, "past"));
      expect(slotLabelled(list, "12:00")).toEqual(expected("12:00", 20, "past"));
      expect(slotLabelled(list, "12:15")).toEqual(expected("12:15", 20));
      expect(slotLabelled(list, "12:30")).toEqual(expected("12:30", 20));
    });

    test("at 12:06 marks 12:00 as past, 12:15 as cutoff (now is after 12:05) and 12:30 as bookable", () => {
      const list = listSlots(
        cutoffConfig,
        MONDAY,
        new Date("2026-11-09T11:06:00Z"),
        NOTHING_BOOKED,
      );

      expect(slotLabelled(list, "12:00")).toEqual(expected("12:00", 20, "past"));
      expect(slotLabelled(list, "12:15")).toEqual(expected("12:15", 20, "cutoff"));
      expect(slotLabelled(list, "12:30")).toEqual(expected("12:30", 20));
    });

    test("keeps 12:15 bookable at exactly start − cutoff (now 12:05)", () => {
      const list = listSlots(
        cutoffConfig,
        MONDAY,
        new Date("2026-11-09T11:05:00Z"),
        NOTHING_BOOKED,
      );

      expect(slotLabelled(list, "12:15")).toEqual(expected("12:15", 20));
    });

    test("marks 12:15 as cutoff one second after start − cutoff (now 12:05:01)", () => {
      const list = listSlots(
        cutoffConfig,
        MONDAY,
        new Date("2026-11-09T11:05:01Z"),
        NOTHING_BOOKED,
      );

      expect(slotLabelled(list, "12:15")).toEqual(expected("12:15", 20, "cutoff"));
    });
  });

  describe("with booked rows (seed, Monday 12:00)", () => {
    test("marks a slot with 20 of 20 booked as full, with 0 available", () => {
      const rows = booked({ "2026-11-09T11:30:00Z": { booked: 20, capacity: 20 } });

      expect(slotLabelled(listSlots(seedConfig, MONDAY, NOON, rows), "12:30")).toEqual(
        expected("12:30", 0, "full"),
      );
    });

    test("marks a slot with 18 of 20 booked as full for 3 items, with 2 available", () => {
      const rows = booked({ "2026-11-09T11:30:00Z": { booked: 18, capacity: 20 } });

      expect(slotLabelled(listSlots(seedConfig, MONDAY, NOON, rows, 3), "12:30")).toEqual(
        expected("12:30", 2, "full"),
      );
    });

    test("keeps a slot with 18 of 20 booked bookable for 2 items", () => {
      const rows = booked({ "2026-11-09T11:30:00Z": { booked: 18, capacity: 20 } });

      expect(slotLabelled(listSlots(seedConfig, MONDAY, NOON, rows, 2), "12:30")).toEqual(
        expected("12:30", 2),
      );
    });

    test("asks for 1 item by default: a slot with 19 of 20 booked stays bookable", () => {
      const rows = booked({ "2026-11-09T11:30:00Z": { booked: 19, capacity: 20 } });

      expect(slotLabelled(listSlots(seedConfig, MONDAY, NOON, rows), "12:30")).toEqual(
        expected("12:30", 1),
      );
    });

    test("uses a row's own capacity: 5 of 10 booked leaves 5 available", () => {
      const rows = booked({ "2026-11-09T11:45:00Z": { booked: 5, capacity: 10 } });

      expect(slotLabelled(listSlots(seedConfig, MONDAY, NOON, rows), "12:45")).toEqual(
        expected("12:45", 5),
      );
    });

    test("marks every otherwise bookable slot as full when items exceed capacityPerSlot", () => {
      const list = listSlots(seedConfig, MONDAY, NOON, NOTHING_BOOKED, 21);

      expect(slotLabelled(list, "12:00")).toEqual(expected("12:00", 20, "past"));
      expect(slotLabelled(list, "12:15")).toEqual(expected("12:15", 20, "too_soon"));
      expect(list.slice(6).map(view)).toEqual(
        list.slice(6).map((slot) => expected(slot.label, 20, "full")),
      );
    });

    test("keys rows by instant: on 2026-10-25 only the first of the two 02:00 slots is full", () => {
      const rows = booked({ "2026-10-25T00:00:00Z": { booked: 20, capacity: 20 } });
      const list = listSlots(allDayConfig, "2026-10-25", new Date("2026-10-24T12:00:00Z"), rows);
      const twoOClock = list.filter((slot) => slot.label === "02:00").map(view);

      expect(twoOClock).toEqual([
        {
          start: "2026-10-25T00:00:00.000Z",
          label: "02:00",
          available: 0,
          bookable: false,
          reason: "full",
        },
        { start: "2026-10-25T01:00:00.000Z", label: "02:00", available: 20, bookable: true },
      ]);
    });
  });

  describe("reports the first reason that applies", () => {
    test("reports past for a past slot that is also full", () => {
      const rows = booked({ "2026-11-09T10:00:00Z": { booked: 20, capacity: 20 } });

      expect(slotLabelled(listSlots(seedConfig, MONDAY, NOON, rows), "11:00")).toEqual(
        expected("11:00", 0, "past"),
      );
    });

    test("reports past for a past slot that is also inside the cut-off (cutoffConfig at 12:00, slot 12:00)", () => {
      expect(slotLabelled(listSlots(cutoffConfig, MONDAY, NOON, NOTHING_BOOKED), "12:00")).toEqual(
        expected("12:00", 20, "past"),
      );
    });

    test("reports cutoff for a slot inside both the cut-off and the prep time (seed at 12:12, slot 12:15)", () => {
      const list = listSlots(seedConfig, MONDAY, new Date("2026-11-09T11:12:00Z"), NOTHING_BOOKED);

      expect(slotLabelled(list, "12:15")).toEqual(expected("12:15", 20, "cutoff"));
      expect(slotLabelled(list, "12:30")).toEqual(expected("12:30", 20, "too_soon"));
      expect(slotLabelled(list, "12:45")).toEqual(expected("12:45", 20));
    });

    test("reports cutoff for a cut-off slot that is also full (cutoffConfig at 12:06, slot 12:15)", () => {
      const rows = booked({ "2026-11-09T11:15:00Z": { booked: 20, capacity: 20 } });
      const now = new Date("2026-11-09T11:06:00Z");

      expect(slotLabelled(listSlots(cutoffConfig, MONDAY, now, rows), "12:15")).toEqual(
        expected("12:15", 0, "cutoff"),
      );
    });

    test("reports too_soon for a too-soon slot that is also full", () => {
      const rows = booked({ "2026-11-09T11:15:00Z": { booked: 20, capacity: 20 } });

      expect(slotLabelled(listSlots(seedConfig, MONDAY, NOON, rows), "12:15")).toEqual(
        expected("12:15", 0, "too_soon"),
      );
    });
  });

  test("lists no slots for a closed day (Sun 2026-11-08)", () => {
    expect(listSlots(seedConfig, "2026-11-08", NOON, NOTHING_BOOKED)).toEqual([]);
  });
});
