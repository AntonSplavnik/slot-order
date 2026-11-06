import { floorDiv, sum } from "./integers";

/**
 * Largest-remainder split of `total` in proportion to `weights` (§7.3.3): each share floored, then the
 * leftover cents one by one to the largest fractional remainders, ties to the earlier index. If every
 * weight is 0, round robin from the first.
 */
export function allocate(total: number, weights: number[]): number[] {
  const weightSum = sum(weights);
  if (weightSum === 0) return roundRobin(total, weights.length);
  // A share's fraction is (total × weight mod weightSum) / weightSum: comparing the numerators suffices.
  const shares = weights.map((weight, index) => {
    const exact = total * weight;
    const remainder = exact % weightSum;
    return { index, cents: (exact - remainder) / weightSum, remainder };
  });
  let leftover = total - sum(shares.map((share) => share.cents));
  const byRemainder = shares.toSorted((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const share of byRemainder) {
    if (leftover === 0) break;
    share.cents += 1;
    leftover -= 1;
  }
  return shares.map((share) => share.cents);
}

/** `total` cents dealt one at a time over `count` places, from the first (`roundRobin(3, 2)` → [2, 1]). */
function roundRobin(total: number, count: number): number[] {
  if (count === 0) {
    if (total === 0) return [];
    throw new RangeError(`cannot allocate ${total} over no weights`);
  }
  const base = floorDiv(total, count);
  const extra = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

/** `allocate` over `items` by `weightOf`: each item paired with its share, in the items' order. */
export function allocateOver<T>(
  total: number,
  items: readonly T[],
  weightOf: (item: T) => number,
): [T, number][] {
  const shares = allocate(total, items.map(weightOf));
  // allocate returns exactly one share per weight.
  return items.map((item, index) => [item, shares[index] as number]);
}
