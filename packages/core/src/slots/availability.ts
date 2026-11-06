import type {
  Booked,
  DayString,
  SlotAvailability,
  SlotConfig,
  SlotReason,
  SlotUsage,
} from "../schemas/slots";
import { earliestOnGrid, slotGrid } from "./grid";
import { MINUTE_MS } from "./time";

// Availability and the rules a slot is judged by (docs/design.md §6.1, §6.2 listSlots).

/** A slot's row; a slot without one has nothing booked at the configured capacity (§3 Slot rows). */
function usageOf(config: SlotConfig, booked: Booked, start: Date): SlotUsage {
  return booked.get(start.getTime()) ?? { booked: 0, capacity: config.capacityPerSlot };
}

/** Available = capacity − booked, holds included (§6.1). */
export function availableAt(config: SlotConfig, booked: Booked, start: Date): number {
  const usage = usageOf(config, booked, start);
  return usage.capacity - usage.booked;
}

/** Past (§6.2): the slot starts at or before now. */
export function hasStarted(start: Date, now: Date): boolean {
  return start.getTime() <= now.getTime();
}

/** Cut-off (§6.1): a slot can be ordered while now <= start − cutoffMinutes. */
export function isPastCutoff(config: SlotConfig, start: Date, now: Date): boolean {
  return now.getTime() > start.getTime() - config.cutoffMinutes * MINUTE_MS;
}

/** Too soon (§6.1): before the earliest start, or the day has no earliest start left. */
export function isTooSoon(start: Date, earliest: Date | null): boolean {
  return earliest === null || start.getTime() < earliest.getTime();
}

/** The first reason that applies, in the order of §6.2; `undefined` for a bookable slot. */
function reasonFor(
  config: SlotConfig,
  start: Date,
  now: Date,
  earliest: Date | null,
  available: number,
  items: number,
): SlotReason | undefined {
  if (hasStarted(start, now)) return "past";
  if (isPastCutoff(config, start, now)) return "cutoff";
  if (isTooSoon(start, earliest)) return "too_soon";
  if (available < items) return "full";
  return undefined;
}

/** Every slot of the day with its availability and, when not bookable, the first reason (§6.2). */
export function listSlots(
  config: SlotConfig,
  day: DayString,
  now: Date,
  booked: Booked,
  items = 1,
): SlotAvailability[] {
  const grid = slotGrid(config, day);
  const earliest = earliestOnGrid(config, grid, now);
  return grid.map((slot) => {
    const available = availableAt(config, booked, slot.start);
    const reason = reasonFor(config, slot.start, now, earliest, available, items);
    return reason === undefined
      ? { ...slot, available, bookable: true }
      : { ...slot, available, bookable: false, reason };
  });
}
