import type { MenuItem, PublicMenu } from "@slot-order/core";

// The menu screen's sections (docs/design.md §11.1, §11.2): the menu has no section column, so they are derived
// from `kind` and `vatCategory`.

export type SectionId = "food" | "drinks" | "menus";
export type MenuSection = { id: SectionId; title: string; items: MenuItem[] };

const SECTIONS: { id: SectionId; title: string; holds: (item: MenuItem) => boolean }[] = [
  { id: "food", title: "Food", holds: (i) => i.kind === "item" && i.vatCategory === "food" },
  { id: "drinks", title: "Drinks", holds: (i) => i.kind === "item" && i.vatCategory === "drink" },
  { id: "menus", title: "Menus", holds: (i) => i.kind === "combo" },
];

/** Food, Drinks, Menus, derived from `kind` and `vatCategory`; inactive items hidden; empty sections omitted. */
export function menuSections(menu: PublicMenu): MenuSection[] {
  const visible = menu.items.filter((i) => i.active).sort((a, b) => a.sort - b.sort);
  return SECTIONS.map(({ id, title, holds }) => ({
    id,
    title,
    items: visible.filter(holds),
  })).filter((section) => section.items.length > 0);
}

/** A lookup: it finds inactive items too (the checkout can still name a stored line). */
export function itemById(menu: PublicMenu, id: string): MenuItem | undefined {
  return menu.items.find((i) => i.id === id);
}
