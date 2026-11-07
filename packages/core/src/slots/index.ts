// Slot rules (docs/design.md §6): the API of §6.2. Every function is pure; `now` and the config are
// arguments, instants are `Date`s and a slot is identified by its instant.
import type { SlotConfig } from "../schemas/slots";
import { labelOf } from "./time";

export { listSlots } from "./availability";
export { checkSlot, holdExpiry } from "./check";
export { dayStatus, todayIn } from "./day";
export { earliestStart, slotGrid } from "./grid";
export { dayOf } from "./time";

/** The "HH:MM" label of any instant in the config's timezone (§10.1 `slotLabel`). */
export function slotLabel(config: SlotConfig, start: Date): string {
  return labelOf(config, start.getTime());
}
