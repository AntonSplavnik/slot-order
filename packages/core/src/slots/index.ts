// Slot rules (docs/design.md §6). Stubs: M1 is built test-first, the implementation replaces
// these against packages/core/test/slots/.
import type {
  Booked,
  DayStatus,
  DayString,
  Slot,
  SlotAvailability,
  SlotCheck,
  SlotConfig,
} from "../schemas/slots";

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}

/** The calendar day of `now` in the config's timezone. */
export function todayIn(_config: SlotConfig, _now: Date): DayString {
  return notImplemented("todayIn");
}

/** The calendar day of any instant in the config's timezone. */
export function dayOf(_config: SlotConfig, _instant: Date): DayString {
  return notImplemented("dayOf");
}

/** The day's slots in order (§6.1); `[]` for a closed day. */
export function slotGrid(_config: SlotConfig, _day: DayString): Slot[] {
  return notImplemented("slotGrid");
}

/** `closed`, `past`, `too_far` or `open`, in that order of precedence (§6.2). */
export function dayStatus(_config: SlotConfig, _day: DayString, _now: Date): DayStatus {
  return notImplemented("dayStatus");
}

/** The first slot of the day with `start >= now + prepMinutes`; `null` when none is left. */
export function earliestStart(_config: SlotConfig, _day: DayString, _now: Date): Date | null {
  return notImplemented("earliestStart");
}

/** Every slot of the day with its availability and, when not bookable, the first reason (§6.2). */
export function listSlots(
  _config: SlotConfig,
  _day: DayString,
  _now: Date,
  _booked: Booked,
  _items = 1,
): SlotAvailability[] {
  return notImplemented("listSlots");
}

/** The rule behind `POST /orders`: the first error that applies, in the order of §6.2. */
export function checkSlot(
  _config: SlotConfig,
  _start: Date,
  _items: number,
  _now: Date,
  _booked: Booked,
): SlotCheck {
  return notImplemented("checkSlot");
}

/** `now + holdMinutes`. */
export function holdExpiry(_config: SlotConfig, _now: Date): Date {
  return notImplemented("holdExpiry");
}
