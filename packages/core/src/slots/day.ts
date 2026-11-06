import type { DayStatus, DayString, OpeningRange, SlotConfig } from "../schemas/slots";
import { addDays, dayOf, weekdayOf } from "./time";

// Days (docs/design.md §6.1 day and horizon, §6.2 todayIn and dayStatus). DayStrings are zero-padded
// "YYYY-MM-DD", so comparing two as strings compares them as calendar days.

/** The opening ranges of the day's weekday; `[]` for a closed day. */
export function rangesOf(config: SlotConfig, day: DayString): OpeningRange[] {
  return config.openingHours[weekdayOf(config, day)];
}

/** The calendar day of `now` in the config's timezone (§6.2). */
export function todayIn(config: SlotConfig, now: Date): DayString {
  return dayOf(config, now);
}

/** Horizon (§6.1): today to today + maxDaysAhead − 1 can be booked; later days are too far. */
function isBeyondHorizon(config: SlotConfig, day: DayString, now: Date): boolean {
  return day >= addDays(config, todayIn(config, now), config.maxDaysAhead);
}

/** `closed`, `past`, `too_far` or `open`, in that order of precedence (§6.2). */
export function dayStatus(config: SlotConfig, day: DayString, now: Date): DayStatus {
  if (rangesOf(config, day).length === 0) return "closed";
  if (day < todayIn(config, now)) return "past";
  if (isBeyondHorizon(config, day, now)) return "too_far";
  return "open";
}
