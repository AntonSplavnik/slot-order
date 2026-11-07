import { DayStringSchema, type Slot } from "@slot-order/core";
import type { Context } from "hono";
import { z } from "zod";
import { ApiError } from "../errors";

// What several routes share: reading a JSON body, the id in a path, the calendar day in a query, and the
// instants a day's grid spans.

/** The request body parsed as JSON; a body that is not JSON is 400 `validation` (§12). */
export async function readJson(c: Context): Promise<unknown> {
  const text = await c.req.text();
  try {
    return JSON.parse(text);
  } catch {
    const message = "The body is not valid JSON.";
    throw new ApiError("validation", {
      message,
      issues: [{ code: "invalid_json", path: [], message }],
    });
  }
}

const IdParamSchema = z.object({ id: z.uuid() });

/** The `:id` of the path; not a UUID → ZodError → 400 `validation`. */
export function orderIdParam(c: Context): string {
  return IdParamSchema.parse({ id: c.req.param("id") }).id;
}

/** "YYYY-MM-DD" that is also a day of the calendar: core's slot rules throw on "2026-02-30". */
export const CalendarDaySchema = DayStringSchema.refine((day) => {
  const midnight = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(midnight.getTime()) && midnight.toISOString().startsWith(day);
}, "not a calendar day");

/** The instants a day's grid spans, `[first start, last start + 1 ms)`; null for a day without slots. */
export function gridRange(grid: readonly Slot[]): { from: Date; to: Date } | null {
  const first = grid[0];
  const last = grid.at(-1);
  if (first === undefined || last === undefined) return null;
  return { from: first.start, to: new Date(last.start.getTime() + 1) };
}
