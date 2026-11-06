import type { Booked, SlotCheck, SlotConfig, SlotErrorCode } from "../schemas/slots";
import { availableAt, hasStarted, isPastCutoff, isTooSoon } from "./availability";
import { dayStatus } from "./day";
import { earliestOnGrid, slotGrid } from "./grid";
import { dayOf, MINUTE_MS } from "./time";

// The rule behind POST /orders and the hold (docs/design.md §6.2 checkSlot, holdExpiry).

const refused = (code: SlotErrorCode): SlotCheck => ({ ok: false, code });

/**
 * The first error that applies, in the order of §6.2. A past day is neither closed nor too far, so it
 * reaches the cut-off, which refuses it.
 */
export function checkSlot(
  config: SlotConfig,
  start: Date,
  items: number,
  now: Date,
  booked: Booked,
): SlotCheck {
  const day = dayOf(config, start);
  const status = dayStatus(config, day, now);
  if (status === "closed") return refused("closed_day");
  if (status === "too_far") return refused("too_far");
  const grid = slotGrid(config, day);
  const slot = grid.find((candidate) => candidate.start.getTime() === start.getTime());
  if (slot === undefined) return refused("slot_not_on_grid");
  // A slot that has started is refused even with cutoffMinutes 0, as listSlots calls it past (§6.2).
  if (hasStarted(slot.start, now) || isPastCutoff(config, slot.start, now)) {
    return refused("slot_past_cutoff");
  }
  if (isTooSoon(slot.start, earliestOnGrid(config, grid, now))) return refused("slot_too_soon");
  // Against the configured capacity, whatever an older slot row's capacity says (§6.2).
  if (items > config.capacityPerSlot) return refused("too_many_items");
  if (availableAt(config, booked, slot.start) < items) return refused("slot_full");
  return { ok: true, slot };
}

/** `now + holdMinutes` (§6.2). */
export function holdExpiry(config: SlotConfig, now: Date): Date {
  return new Date(now.getTime() + config.holdMinutes * MINUTE_MS);
}
