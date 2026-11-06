import { TZDate, tzOffset } from "@date-fns/tz";
import { format, isExists } from "date-fns";
import { type DayString, type SlotConfig, WEEKDAYS, type Weekday } from "../schemas/slots";

// Timezone helpers (docs/design.md §6.2, §6.3). Wall clock → instant only through `wallToInstant`, which
// does not depend on the host's timezone; TZDate only reads an instant's wall clock (labels, days, weekdays).

export const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type CalendarDay = { year: number; monthIndex: number; date: number };

/** "YYYY-MM-DD" as numbers, the month 0-based as `Date.UTC` takes it; throws for a day that does not exist. */
function parseDay(day: DayString): CalendarDay {
  const match = DAY_PATTERN.exec(day);
  const year = Number(match?.[1]);
  const monthIndex = Number(match?.[2]) - 1;
  const date = Number(match?.[3]);
  if (!isExists(year, monthIndex, date)) throw new RangeError(`not a calendar day: "${day}"`);
  return { year, monthIndex, date };
}

/** The timezone's UTC offset at an instant, in ms (`tzOffset` answers minutes, fractional for old offsets). */
function offsetMs(timeZone: string, instant: number): number {
  return Math.round(tzOffset(timeZone, new Date(instant)) * MINUTE_MS);
}

/**
 * Wall clock → instant in ms, the same on every host (§6.3), with Temporal's "compatible" disambiguation:
 * - an ambiguous time (clocks back) is its first occurrence, the earlier instant: 02:30 on 2026-10-25 in
 *   Berlin is 02:30 CEST (00:30Z);
 * - a time that does not exist (clocks forward) moves forward by the length of the gap: 02:30 on
 *   2026-03-29 in Berlin is 03:30 CEST (01:30Z).
 * The arguments are those of `Date.UTC` (month 0-based), which turns hour 24 into the next day's midnight
 * and a date past the month's end into the next month. The offsets a day either side bracket any change
 * near the time; this assumes no zone changes its offset twice within two days.
 */
export function wallToInstant(
  timeZone: string,
  year: number,
  monthIndex: number,
  date: number,
  hours: number,
  minutes: number,
): number {
  const wall = Date.UTC(year, monthIndex, date, hours, minutes);
  const before = offsetMs(timeZone, wall - DAY_MS);
  const after = offsetMs(timeZone, wall + DAY_MS);
  if (Number.isNaN(before) || Number.isNaN(after)) {
    throw new RangeError(`unknown timezone: "${timeZone}"`);
  }
  // The instants whose wall clock reads `wall`: two when it is ambiguous, none when it is in a gap.
  const readsBack = (instant: number) => instant + offsetMs(timeZone, instant) === wall;
  const candidates = [wall - before, wall - after].filter(readsBack);
  // In a gap, the offset from before the change moves the time forward by the length of the gap.
  return candidates.length > 0 ? Math.min(...candidates) : wall - before;
}

/** Wall clock → instant in ms (§6.2): "HH:MM" on `day` in the timezone; "24:00" is the next midnight. */
export function instantAt(config: SlotConfig, day: DayString, hhmm: string): number {
  const { year, monthIndex, date } = parseDay(day);
  const hours = Number(hhmm.slice(0, 2));
  const minutes = Number(hhmm.slice(3, 5));
  return wallToInstant(config.timezone, year, monthIndex, date, hours, minutes);
}

/** Instant → wall clock, formatted with a date-fns pattern in the config's timezone. */
function wallClock(config: SlotConfig, instant: number, pattern: string): string {
  return format(new TZDate(instant, config.timezone), pattern);
}

/** The calendar day of any instant in the config's timezone (§6.2). */
export function dayOf(config: SlotConfig, instant: Date): DayString {
  return wallClock(config, instant.getTime(), "yyyy-MM-dd");
}

/** A slot's label: its "HH:MM" in the config's timezone (§6.2). */
export function labelOf(config: SlotConfig, instant: number): string {
  return wallClock(config, instant, "HH:mm");
}

/** The calendar day `days` after `day` (month and year ends included). */
export function addDays(config: SlotConfig, day: DayString, days: number): DayString {
  const { year, monthIndex, date } = parseDay(day);
  const midnight = wallToInstant(config.timezone, year, monthIndex, date + days, 0, 0);
  return dayOf(config, new Date(midnight));
}

/** The weekday of a day, read from the TZDate of its midnight. */
export function weekdayOf(config: SlotConfig, day: DayString): Weekday {
  const midnight = new TZDate(instantAt(config, day, "00:00"), config.timezone);
  // getDay() counts from Sunday = 0; WEEKDAYS starts on Monday.
  const weekday = WEEKDAYS[(midnight.getDay() + 6) % 7];
  if (weekday === undefined) throw new RangeError(`no weekday for "${day}"`);
  return weekday;
}
