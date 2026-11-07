import type { MenuItem, OptionGroup } from "@slot-order/core";

// The option sheet's rules (docs/design.md §11.1, §11.2). Not implemented yet (M6 contract).

/** A `maxChoices: 1` group replaces its selection; otherwise toggles, refusing a choice beyond `maxChoices`. */
export function toggleOption(
  _group: OptionGroup,
  _selected: readonly string[],
  _optionId: string,
): string[] {
  throw new Error("not implemented");
}

/** Every group between its min and max choices, and no id outside the item's groups. */
export function selectionValid(_item: MenuItem, _optionIds: readonly string[]): boolean {
  throw new Error("not implemented");
}

/** The chosen options' names in the menu's order. */
export function optionNames(_item: MenuItem, _optionIds: readonly string[]): string[] {
  throw new Error("not implemented");
}

/** The item's price plus the chosen deltas, in cents. */
export function unitPrice(_item: MenuItem, _optionIds: readonly string[]): number {
  throw new Error("not implemented");
}
