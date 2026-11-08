import type { MenuItem, PublicMenu } from "@slot-order/core";
import { itemById } from "@/lib/menu";

// Words for an item on the screens (docs/design.md §11.6): a combo's components, the grey line under an item,
// a cart line's options with their group names. Formatting only; the rules live in `src/lib/`.

/** A combo's components in words, like "2 × Wings, Fries". */
export function componentsText(menu: PublicMenu, item: MenuItem): string {
  return item.components
    .map((c) => {
      const name = itemById(menu, c.itemId)?.name ?? c.itemId;
      return c.quantity > 1 ? `${c.quantity} × ${name}` : name;
    })
    .join(", ");
}

/** The grey line under an item: its description, or a combo's components. */
export function describe(menu: PublicMenu, item: MenuItem): string | undefined {
  if (item.description !== undefined) return item.description;
  return item.kind === "combo" ? componentsText(menu, item) : undefined;
}

/** A cart line's choices by group in the menu's order, like "Size: large • Sauce: garlic" (§11.7). */
export function optionSummary(item: MenuItem, optionIds: readonly string[]): string {
  return item.optionGroups
    .map((group) => {
      const names = group.options.filter((o) => optionIds.includes(o.id)).map((o) => o.name);
      return names.length === 0 ? null : `${group.name}: ${names.join(", ")}`;
    })
    .filter((part) => part !== null)
    .join(" • ");
}
