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

/**
 * Whether the item goes into the cart at once from its round "+" (§11.2, §11.9): a drink (`kind: item`,
 * `vatCategory: drink`) without a required option group (none with `minChoices > 0`). Everything else opens
 * the item page. The grid and `upsellItems` share it.
 */
export function quickAdds(item: MenuItem): boolean {
  return (
    item.kind === "item" &&
    item.vatCategory === "drink" &&
    !item.optionGroups.some((group) => group.minChoices > 0)
  );
}

/**
 * The item page's "Add a drink" rows (§11.2, §11.9): for an item that is not a drink, the Drinks section's
 * items (active, in `sort` order, as `menuSections` gives them) that `quickAdds`; for a drink, `[]`; never the
 * item itself. The menu's own item objects, not copies.
 */
export function upsellItems(menu: PublicMenu, item: MenuItem): MenuItem[] {
  if (item.kind === "item" && item.vatCategory === "drink") return [];
  const drinks = menuSections(menu).find((section) => section.id === "drinks");
  return (drinks?.items ?? []).filter((drink) => quickAdds(drink) && drink.id !== item.id);
}
