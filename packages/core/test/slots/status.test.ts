import { describe, expect, test } from "vitest";
import { type DayStatus, dayOf, dayStatus, todayIn } from "../../src/index";
import { seedConfig } from "../fixtures/slotConfigs";

// docs/design.md §6.1 (horizon), §6.2 (todayIn, dayOf, dayStatus), §6.3 (Berlin days while the process
// runs in UTC). Europe/Berlin: CET = +01:00, CEST = +02:00.

describe("todayIn", () => {
  test("is 2026-11-06 at 23:30 Berlin (2026-11-06T22:30Z)", () => {
    expect(todayIn(seedConfig, new Date("2026-11-06T22:30:00Z"))).toBe("2026-11-06");
  });

  test("is already 2026-11-07 at 00:30 Berlin (2026-11-06T23:30Z), while UTC is still on 2026-11-06", () => {
    expect(todayIn(seedConfig, new Date("2026-11-06T23:30:00Z"))).toBe("2026-11-07");
  });

  test("turns at Berlin midnight, not at UTC midnight", () => {
    expect(todayIn(seedConfig, new Date("2026-11-06T22:59:59.999Z"))).toBe("2026-11-06");
    expect(todayIn(seedConfig, new Date("2026-11-06T23:00:00Z"))).toBe("2026-11-07");
    expect(todayIn(seedConfig, new Date("2026-11-07T00:30:00Z"))).toBe("2026-11-07");
  });
});

describe("dayOf", () => {
  test("is 2026-11-06 for 2026-11-06T22:30Z (23:30 Berlin)", () => {
    expect(dayOf(seedConfig, new Date("2026-11-06T22:30:00Z"))).toBe("2026-11-06");
  });

  test("is 2026-11-07 for 2026-11-06T23:30Z (00:30 Berlin)", () => {
    expect(dayOf(seedConfig, new Date("2026-11-06T23:30:00Z"))).toBe("2026-11-07");
  });

  test("turns at 22:00Z in summer time (CEST)", () => {
    expect(dayOf(seedConfig, new Date("2026-07-01T21:59:59.999Z"))).toBe("2026-07-01");
    expect(dayOf(seedConfig, new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });

  test("puts the first and last instants of the DST days on those days", () => {
    expect(dayOf(seedConfig, new Date("2026-03-28T22:59:59.999Z"))).toBe("2026-03-28");
    expect(dayOf(seedConfig, new Date("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
    expect(dayOf(seedConfig, new Date("2026-03-29T21:59:59.999Z"))).toBe("2026-03-29");
    expect(dayOf(seedConfig, new Date("2026-03-29T22:00:00Z"))).toBe("2026-03-30");
    expect(dayOf(seedConfig, new Date("2026-10-24T21:59:59.999Z"))).toBe("2026-10-24");
    expect(dayOf(seedConfig, new Date("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    expect(dayOf(seedConfig, new Date("2026-10-25T22:59:59.999Z"))).toBe("2026-10-25");
    expect(dayOf(seedConfig, new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });
});

describe("dayStatus", () => {
  describe("at Sat 2026-11-07 00:30 Berlin (2026-11-06T23:30Z)", () => {
    const now = new Date("2026-11-06T23:30:00Z");

    test.each<[string, DayStatus]>([
      ["2026-11-06", "past"],
      ["2026-11-07", "open"],
      ["2026-11-08", "closed"],
      ["2026-11-09", "open"],
      ["2026-11-10", "open"],
      ["2026-11-11", "open"],
      ["2026-11-12", "open"],
      ["2026-11-13", "open"],
      ["2026-11-14", "too_far"],
    ])("reports %s as %s", (day, status) => {
      expect(dayStatus(seedConfig, day, now)).toBe(status);
    });

    test("reports a Sunday in the past (2026-11-01) as closed, not past", () => {
      expect(dayStatus(seedConfig, "2026-11-01", now)).toBe("closed");
    });

    test("reports a Sunday beyond the horizon (2026-11-15) as closed, not too_far", () => {
      expect(dayStatus(seedConfig, "2026-11-15", now)).toBe("closed");
    });
  });

  describe("at Fri 2026-11-06 23:30 Berlin (2026-11-06T22:30Z), one hour earlier", () => {
    const now = new Date("2026-11-06T22:30:00Z");

    test.each<[string, DayStatus]>([
      ["2026-11-05", "past"],
      ["2026-11-06", "open"],
      ["2026-11-12", "open"],
      ["2026-11-13", "too_far"],
    ])("reports %s as %s", (day, status) => {
      expect(dayStatus(seedConfig, day, now)).toBe(status);
    });
  });

  test("counts the horizon in calendar days across a month end: at Fri 2026-11-27, 12-03 is open and 12-04 too_far", () => {
    const now = new Date("2026-11-27T11:00:00Z");

    expect(dayStatus(seedConfig, "2026-12-03", now)).toBe("open");
    expect(dayStatus(seedConfig, "2026-12-04", now)).toBe("too_far");
  });

  test("counts the horizon in Berlin days across the spring change: at Fri 2026-03-27 23:30 CET, 04-02 is open and 04-03 too_far", () => {
    const now = new Date("2026-03-27T22:30:00Z");

    expect(dayStatus(seedConfig, "2026-03-27", now)).toBe("open");
    expect(dayStatus(seedConfig, "2026-04-02", now)).toBe("open");
    expect(dayStatus(seedConfig, "2026-04-03", now)).toBe("too_far");
  });

  test("counts the horizon in Berlin days across the autumn change: at Tue 2026-10-20 00:30 CEST, 10-26 is open and 10-27 too_far", () => {
    const now = new Date("2026-10-19T22:30:00Z");

    expect(dayStatus(seedConfig, "2026-10-19", now)).toBe("past");
    expect(dayStatus(seedConfig, "2026-10-20", now)).toBe("open");
    expect(dayStatus(seedConfig, "2026-10-26", now)).toBe("open");
    expect(dayStatus(seedConfig, "2026-10-27", now)).toBe("too_far");
  });
});
