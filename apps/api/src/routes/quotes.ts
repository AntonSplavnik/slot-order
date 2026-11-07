import { CartSchema, priceCart, type Receipt } from "@slot-order/core";
import { Hono } from "hono";
import type { AppDeps } from "../app";
import { readJson } from "./shared";

/** `POST /quotes` (docs/design.md §10): the cart priced by core against the menu; nothing is stored. */
export function quoteRoutes(deps: AppDeps) {
  return new Hono().post("/quotes", async (c) => {
    const cart = CartSchema.parse(await readJson(c));
    const receipt: Receipt = priceCart(await deps.repo.getMenu(), cart);
    return c.json(receipt);
  });
}
