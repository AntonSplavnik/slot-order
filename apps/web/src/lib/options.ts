import type { MenuItem, OptionGroup } from "@slot-order/core";

// The option sheet's rules (docs/design.md §11.1, §11.2).

/**
 * A `maxChoices: 1` group replaces its selection (radio: the old id leaves, the new one is appended; tapping the
 * chosen one keeps it); otherwise toggles, refusing a choice beyond `maxChoices`. An id outside the group, or a
 * refused choice, answers the selection unchanged. Ids of other groups stay in place.
 */
export function toggleOption(
  group: OptionGroup,
  selected: readonly string[],
  optionId: string,
): string[] {
  const groupIds = new Set(group.options.map((o) => o.id));
  if (!groupIds.has(optionId)) return [...selected];

  if (group.maxChoices === 1) {
    if (selected.includes(optionId)) return [...selected];
    return [...selected.filter((id) => !groupIds.has(id)), optionId];
  }

  if (selected.includes(optionId)) return selected.filter((id) => id !== optionId);
  const chosenInGroup = selected.filter((id) => groupIds.has(id)).length;
  if (chosenInGroup >= group.maxChoices) return [...selected];
  return [...selected, optionId];
}

/** Every group between its min and max choices, no id outside the item's groups, no id twice. */
export function selectionValid(item: MenuItem, optionIds: readonly string[]): boolean {
  if (new Set(optionIds).size !== optionIds.length) return false;
  const known = new Set(item.optionGroups.flatMap((g) => g.options.map((o) => o.id)));
  if (!optionIds.every((id) => known.has(id))) return false;
  return item.optionGroups.every((group) => {
    const count = group.options.filter((o) => optionIds.includes(o.id)).length;
    return count >= group.minChoices && count <= group.maxChoices;
  });
}

/** The chosen options' names in the menu's order. */
export function optionNames(item: MenuItem, optionIds: readonly string[]): string[] {
  return item.optionGroups.flatMap((g) =>
    g.options.filter((o) => optionIds.includes(o.id)).map((o) => o.name),
  );
}

/** The item's price plus the chosen deltas, in cents (§7.3). */
export function unitPrice(item: MenuItem, optionIds: readonly string[]): number {
  const deltas = item.optionGroups
    .flatMap((g) => g.options)
    .filter((o) => optionIds.includes(o.id))
    .reduce((total, o) => total + o.priceDeltaCents, 0);
  return item.priceCents + deltas;
}
