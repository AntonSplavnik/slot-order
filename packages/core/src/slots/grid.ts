import type { DayString, Slot, SlotConfig } from "../schemas/slots";
import { rangesOf } from "./day";
import { instantAt, labelOf, MINUTE_MS } from "./time";

// The grid (docs/design.md §6.1, §6.3). Walked in instants, so a DST day simply has fewer or more slots.

/**
 * The day's slots in order (§6.1): each range from its open instant, `slotMinutes` apart, while
 * start + slot <= close. A start inside the previous slot is skipped, so no instant appears twice
 * (§3 Slot grid, §6.3); that can only happen when a range ends in the spring gap, which moves forward.
 */
export function slotGrid(config: SlotConfig, day: DayString): Slot[] {
  const step = config.slotMinutes * MINUTE_MS;
  const slots: Slot[] = [];
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const [open, close] of rangesOf(config, day)) {
    const end = instantAt(config, day, close);
    for (let start = instantAt(config, day, open); start + step <= end; start += step) {
      if (start < previousEnd) continue;
      slots.push({ start: new Date(start), label: labelOf(config, start) });
      previousEnd = start + step;
    }
  }
  return slots;
}

/** Earliest start (§6.1): the first slot of `grid` with start >= now + prepMinutes; `null` when none is left. */
export function earliestOnGrid(config: SlotConfig, grid: Slot[], now: Date): Date | null {
  const ready = now.getTime() + config.prepMinutes * MINUTE_MS;
  return grid.find((slot) => slot.start.getTime() >= ready)?.start ?? null;
}

/** The first slot of the day with `start >= now + prepMinutes`; `null` when none is left (§6.2). */
export function earliestStart(config: SlotConfig, day: DayString, now: Date): Date | null {
  return earliestOnGrid(config, slotGrid(config, day), now);
}
