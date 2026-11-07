import type { DayStatus, DayString, SlotAvailabilityDto, SlotReason } from "@slot-order/core";

// The checkout screen's day strip and slot chips (docs/design.md §11.1, §11.2). Days are calendar dates held as
// "YYYY-MM-DD"; the arithmetic runs on UTC midnights, so nothing depends on the process time zone.

export type Chip = { label: string; disabled: boolean; hint: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

const HINTS: Record<SlotReason, string> = {
  past: "Already started",
  cutoff: "Too late to order",
  too_soon: "Too soon",
  full: "Full",
};

const DAY_STATUS_TEXT: Record<DayStatus, string> = {
  closed: "Closed",
  past: "Past",
  too_far: "Not yet",
  open: "",
};

const LABEL_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** The UTC midnight of a day string. */
function utcMidnight(day: DayString): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1);
}

/** The day string of a UTC instant. */
function dayOf(ms: number): DayString {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `today` and the next `days − 1` calendar days. */
export function dayStrip(today: DayString, days = 7): DayString[] {
  const start = utcMidnight(today);
  return Array.from({ length: Math.max(0, days) }, (_, i) => dayOf(start + i * DAY_MS));
}

/** The chip of a slot: disabled with a hint when it is not bookable (no hint without a reason). */
export function chip(slot: SlotAvailabilityDto): Chip {
  if (slot.bookable) return { label: slot.label, disabled: false, hint: null };
  return {
    label: slot.label,
    disabled: true,
    hint: slot.reason === undefined ? null : HINTS[slot.reason],
  };
}

/** "Today", "Tomorrow", else the weekday and date, like "Wed 11 Nov" (never the year). */
export function dayLabel(day: DayString, today: DayString): string {
  const offset = Math.round((utcMidnight(day) - utcMidnight(today)) / DAY_MS);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const parts = LABEL_FORMAT.formatToParts(new Date(utcMidnight(day)));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/** "Closed", "Past", "Not yet", or "" for an open day. */
export function dayStatusText(status: DayStatus): string {
  return DAY_STATUS_TEXT[status];
}
