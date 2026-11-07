import {
  type Booked,
  canTransition,
  dayStatus,
  normalizePickupCode,
  type OrderStatus,
  PickupRequestSchema,
  type SlotConfig,
  type StaffBoard,
  type StaffOrder,
  StaffQuerySchema,
  slotGrid,
  todayIn,
} from "@slot-order/core";
import { Hono } from "hono";
import type { AppDeps } from "../app";
import { ApiError } from "../errors";
import type { Order } from "../repo/types";
import { staffOrder } from "./present";
import { CalendarDaySchema, gridRange, orderIdParam, readJson } from "./shared";

// The staff routes (docs/design.md §10), mounted on /staff behind the token check (§10.4, app.ts).

const QuerySchema = StaffQuerySchema.extend({ date: CalendarDaySchema.optional() });

/** The statuses the board lists; held orders count in `booked` only (§10). */
const LISTED: ReadonlySet<OrderStatus> = new Set(["paid", "ready", "picked_up"]);

/**
 * Moves `order` to `to` with the conditional update of §8.2 (`WHERE status = <the status read>`), after
 * `canTransition`; a refused move, or one another request made first, is 409 `invalid_transition`.
 */
async function move(
  deps: AppDeps,
  config: SlotConfig,
  order: Order,
  to: "ready" | "picked_up",
): Promise<StaffOrder> {
  if (!canTransition(order.status, to)) throw new ApiError("invalid_transition");
  const moved = await deps.repo.transition(order.id, order.status, to, deps.now());
  if (moved === null) throw new ApiError("invalid_transition");
  return staffOrder(moved, config);
}

export function staffRoutes(deps: AppDeps) {
  return (
    new Hono()
      // The board: every grid slot of the day with its booked/capacity (a slot without a row: 0 of the
      // configured capacity) and its paid, ready and picked-up orders by createdAt; `date` defaults to today.
      .get("/orders", async (c) => {
        const query = QuerySchema.parse(c.req.query());
        const now = deps.now();
        const config = await deps.repo.getSettings();
        const date = query.date ?? todayIn(config, now);
        const grid = slotGrid(config, date);
        const range = gridRange(grid);
        const [usage, orders]: [Booked, Order[]] =
          range === null
            ? [new Map(), []]
            : await Promise.all([
                deps.repo.getSlotUsage(range.from, range.to),
                deps.repo.listOrders(range.from, range.to),
              ]);

        const bySlot = new Map<number, Order[]>();
        for (const order of orders) {
          if (!LISTED.has(order.status)) continue;
          const key = order.slotStart.getTime();
          bySlot.set(key, [...(bySlot.get(key) ?? []), order]);
        }

        const body: StaffBoard = {
          date,
          status: dayStatus(config, date, now),
          slots: grid.map(({ start, label }) => {
            const slot = usage.get(start.getTime());
            return {
              start: start.toISOString(),
              label,
              booked: slot?.booked ?? 0,
              capacity: slot?.capacity ?? config.capacityPerSlot,
              orders: (bySlot.get(start.getTime()) ?? []).map((order) => staffOrder(order, config)),
            };
          }),
        };
        return c.json(body);
      })
      // paid → ready.
      .post("/orders/:id/ready", async (c) => {
        const id = orderIdParam(c);
        const order = await deps.repo.getOrder(id);
        if (order === null) throw new ApiError("order_not_found");
        return c.json(await move(deps, await deps.repo.getSettings(), order, "ready"));
      })
      // paid | ready → picked_up, by the code staff typed or scanned, normalised first (§8.3).
      .post("/pickup", async (c) => {
        const { code } = PickupRequestSchema.parse(await readJson(c));
        const canonical = normalizePickupCode(code);
        const order = canonical === null ? null : await deps.repo.findOrderByPickupCode(canonical);
        if (order === null) throw new ApiError("invalid_code");
        return c.json(await move(deps, await deps.repo.getSettings(), order, "picked_up"));
      })
  );
}
