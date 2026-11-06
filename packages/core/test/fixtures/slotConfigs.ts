import type { SlotConfig } from "../../src/index";

// Slot configs for the slot tests (docs/handoffs/m1-slot-tests.md). All in Europe/Berlin.

/** The seed of docs/design.md §5: Mon–Sat 11:00–22:00, Sunday closed. */
export const seedConfig: SlotConfig = {
  timezone: "Europe/Berlin",
  slotMinutes: 15,
  capacityPerSlot: 20,
  prepMinutes: 20,
  cutoffMinutes: 5,
  holdMinutes: 10,
  maxDaysAhead: 7,
  openingHours: {
    mon: [["11:00", "22:00"]],
    tue: [["11:00", "22:00"]],
    wed: [["11:00", "22:00"]],
    thu: [["11:00", "22:00"]],
    fri: [["11:00", "22:00"]],
    sat: [["11:00", "22:00"]],
    sun: [],
  },
};

/** Open around the clock on every day, Sunday included ("24:00" as the close); otherwise the seed. */
export const allDayConfig: SlotConfig = {
  ...seedConfig,
  openingHours: {
    mon: [["00:00", "24:00"]],
    tue: [["00:00", "24:00"]],
    wed: [["00:00", "24:00"]],
    thu: [["00:00", "24:00"]],
    fri: [["00:00", "24:00"]],
    sat: [["00:00", "24:00"]],
    sun: [["00:00", "24:00"]],
  },
};

/** No prep time and a 10-minute cut-off, so the cut-off is what decides; otherwise the seed. */
export const cutoffConfig: SlotConfig = {
  ...seedConfig,
  prepMinutes: 0,
  cutoffMinutes: 10,
};

/** Mon–Sat with a lunch break: 11:00–14:00 and 17:00–22:00; Sunday closed; otherwise the seed. */
export const splitConfig: SlotConfig = {
  ...seedConfig,
  openingHours: {
    mon: [
      ["11:00", "14:00"],
      ["17:00", "22:00"],
    ],
    tue: [
      ["11:00", "14:00"],
      ["17:00", "22:00"],
    ],
    wed: [
      ["11:00", "14:00"],
      ["17:00", "22:00"],
    ],
    thu: [
      ["11:00", "14:00"],
      ["17:00", "22:00"],
    ],
    fri: [
      ["11:00", "14:00"],
      ["17:00", "22:00"],
    ],
    sat: [
      ["11:00", "14:00"],
      ["17:00", "22:00"],
    ],
    sun: [],
  },
};
