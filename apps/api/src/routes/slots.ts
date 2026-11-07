import {
  type Booked,
  dayStatus,
  listSlots,
  SlotsQuerySchema,
  type SlotsResponse,
  slotGrid,
} from "@slot-order/core";
import { Hono } from "hono";
import type { AppDeps } from "../app";
import { CalendarDaySchema, gridRange } from "./shared";

const QuerySchema = SlotsQuerySchema.extend({ date: CalendarDaySchema });

/**
 * `GET /slots?date=&items=` (docs/design.md §10): the day's status, and on an open day §6.2 `listSlots`
 * for `items`, after releasing the expired holds so the counts are fresh between cron runs. A day that is
 * closed, past or too far answers no slots, and its status says why (§6.4).
 */
export function slotRoutes(deps: AppDeps) {
  return new Hono().get("/slots", async (c) => {
    const { date, items } = QuerySchema.parse(c.req.query());
    const now = deps.now();
    const config = await deps.repo.getSettings();
    const status = dayStatus(config, date, now);
    if (status !== "open") {
      const body: SlotsResponse = { date, status, slots: [] };
      return c.json(body);
    }

    await deps.repo.releaseExpiredHolds(now);
    const range = gridRange(slotGrid(config, date));
    const booked: Booked =
      range === null ? new Map() : await deps.repo.getSlotUsage(range.from, range.to);
    const body: SlotsResponse = {
      date,
      status,
      slots: listSlots(config, date, now, booked, items).map(
        ({ start, label, available, bookable, reason }) => ({
          start: start.toISOString(),
          label,
          available,
          bookable,
          ...(reason === undefined ? {} : { reason }),
        }),
      ),
    };
    return c.json(body);
  });
}
