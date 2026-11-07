import type { Menu, SlotConfig } from "@slot-order/core";
import type { Repository } from "./types";

/** The in-memory repository (§10.2): the route tests' database. Stub until M4's implementation. */
export function createMemoryRepository(_seed: { settings: SlotConfig; menu: Menu }): Repository {
  throw new Error("not implemented: createMemoryRepository");
}
