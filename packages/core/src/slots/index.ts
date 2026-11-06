// Slot rules (docs/design.md §6): the API of §6.2. Every function is pure; `now` and the config are
// arguments, instants are `Date`s and a slot is identified by its instant.
export { listSlots } from "./availability";
export { checkSlot, holdExpiry } from "./check";
export { dayStatus, todayIn } from "./day";
export { earliestStart, slotGrid } from "./grid";
export { dayOf } from "./time";
