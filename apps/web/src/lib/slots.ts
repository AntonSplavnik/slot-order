import type { DayStatus, DayString, SlotAvailabilityDto } from "@slot-order/core";

// The checkout screen's day strip and slot chips (docs/design.md §11.1, §11.2). Not implemented yet (M6 contract).

export type Chip = { label: string; disabled: boolean; hint: string | null };

/** `today` and the next `days − 1` calendar days. */
export function dayStrip(_today: DayString, _days = 7): DayString[] {
  throw new Error("not implemented");
}

/** The chip of a slot: disabled with a hint when it is not bookable. */
export function chip(_slot: SlotAvailabilityDto): Chip {
  throw new Error("not implemented");
}

/** "Today", "Tomorrow", else the weekday and date, like "Wed 11 Nov". */
export function dayLabel(_day: DayString, _today: DayString): string {
  throw new Error("not implemented");
}

/** "Closed", "Past", "Not yet", or "" for an open day. */
export function dayStatusText(_status: DayStatus): string {
  throw new Error("not implemented");
}
