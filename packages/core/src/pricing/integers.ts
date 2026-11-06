// Integer arithmetic for cents (docs/design.md §3 Money). Every division here divides an exact multiple,
// so no result is ever a rounded floating-point quotient.

/** Σ values. */
export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** ⌊a / b⌋ for a ≥ 0 and b > 0, exactly: the remainder comes off before the division. */
export function floorDiv(a: number, b: number): number {
  return (a - (a % b)) / b;
}

/** a / b to the nearest integer, halves up, for a ≥ 0 and b > 0: ⌊(2a + b) / 2b⌋ (§7.3.3, §7.4). */
export function roundHalfUp(a: number, b: number): number {
  return floorDiv(2 * a + b, 2 * b);
}
