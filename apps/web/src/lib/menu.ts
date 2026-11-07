import type { MenuItem, PublicMenu } from "@slot-order/core";

// The menu screen's sections (docs/design.md §11.1, §11.2). Not implemented yet (M6 contract).

export type SectionId = "food" | "drinks" | "menus";
export type MenuSection = { id: SectionId; title: string; items: MenuItem[] };

/** Food, Drinks, Menus, derived from `kind` and `vatCategory`; inactive items hidden; empty sections omitted. */
export function menuSections(_menu: PublicMenu): MenuSection[] {
  throw new Error("not implemented");
}

export function itemById(_menu: PublicMenu, _id: string): MenuItem | undefined {
  throw new Error("not implemented");
}
