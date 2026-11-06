import { z } from "zod";

// Slot configuration and types (docs/design.md §6.2). The schema is the contract between the
// database's `settings` row, the API and the slot rules.

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** "HH:MM", 00:00 to 23:59, or "24:00" ("24:00" only as a closing time, §6.2). Zero-padded, so
 * two of them compare as times when compared as strings. */
export const HHMMSchema = z
  .string()
  .regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, "expected HH:MM, 00:00 to 24:00");

/** `[open, close)`: close after open, so "24:00" can only close (§6.2). */
export const OpeningRangeSchema = z
  .tuple([HHMMSchema, HHMMSchema])
  .refine(([open]) => open !== "24:00", '"24:00" is allowed only as a closing time')
  .refine(([open, close]) => close > open, "close must be after open");
export type OpeningRange = z.infer<typeof OpeningRangeSchema>;

/** A weekday's ranges, sorted and not overlapping; touching is fine, as a range is half-open (§6.2). */
const DayRangesSchema = z
  .array(OpeningRangeSchema)
  .refine(
    (ranges) => ranges.every((range, i) => i === 0 || (ranges[i - 1]?.[1] ?? "") <= range[0]),
    "ranges must be sorted and must not overlap",
  );

export const OpeningHoursSchema = z.object({
  mon: DayRangesSchema,
  tue: DayRangesSchema,
  wed: DayRangesSchema,
  thu: DayRangesSchema,
  fri: DayRangesSchema,
  sat: DayRangesSchema,
  sun: DayRangesSchema,
});
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;

export const SlotConfigSchema = z.object({
  timezone: z.string().min(1),
  slotMinutes: z.number().int().positive(),
  capacityPerSlot: z.number().int().positive(),
  prepMinutes: z.number().int().nonnegative(),
  cutoffMinutes: z.number().int().nonnegative(),
  holdMinutes: z.number().int().positive(),
  maxDaysAhead: z.number().int().positive(),
  openingHours: OpeningHoursSchema,
});
export type SlotConfig = z.infer<typeof SlotConfigSchema>;

/** A calendar day in the config's timezone, "YYYY-MM-DD". */
export const DayStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
export type DayString = z.infer<typeof DayStringSchema>;

export const SlotReasonSchema = z.enum(["past", "cutoff", "too_soon", "full"]);
export type SlotReason = z.infer<typeof SlotReasonSchema>;

export const DayStatusSchema = z.enum(["open", "closed", "past", "too_far"]);
export type DayStatus = z.infer<typeof DayStatusSchema>;

export const SlotErrorCodeSchema = z.enum([
  "closed_day",
  "too_far",
  "slot_not_on_grid",
  "slot_past_cutoff",
  "slot_too_soon",
  "too_many_items",
  "slot_full",
]);
export type SlotErrorCode = z.infer<typeof SlotErrorCodeSchema>;

export type Slot = { start: Date; label: string };

/** What the database knows about a slot that has a row (§3 Slot rows). */
export type SlotUsage = { booked: number; capacity: number };
/** Keyed by `start.getTime()`; a missing slot is `{ booked: 0, capacity: config.capacityPerSlot }`. */
export type Booked = ReadonlyMap<number, SlotUsage>;

export type SlotAvailability = Slot & { available: number; bookable: boolean; reason?: SlotReason };

export type SlotCheck = { ok: true; slot: Slot } | { ok: false; code: SlotErrorCode };
