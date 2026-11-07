import type { PublicMenu } from "@slot-order/core";
import { Hono } from "hono";
import type { AppDeps } from "../app";

/** `GET /menu` (docs/design.md §10): the menu without its promo codes, which customers never see. */
export function menuRoutes(deps: AppDeps) {
  return new Hono().get("/menu", async (c) => {
    const { promoCodes: _hidden, ...menu } = await deps.repo.getMenu();
    const body: PublicMenu = menu;
    return c.json(body);
  });
}
