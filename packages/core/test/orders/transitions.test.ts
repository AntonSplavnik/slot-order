import { describe, expect, test } from "vitest";
import { canTransition, nextStatuses, ORDER_STATUSES, type OrderStatus } from "../../src/index";

// docs/design.md §8.2: the transition table, and nothing else (§8.3: canTransition, nextStatuses).

/** The rows of §8.2, in the table's order ("paid, ready → picked_up" is two rows). */
const ALLOWED: readonly (readonly [OrderStatus, OrderStatus])[] = [
  ["held", "paid"],
  ["held", "expired"],
  ["held", "cancelled"],
  ["expired", "paid"],
  ["expired", "cancelled"],
  ["paid", "ready"],
  ["paid", "picked_up"],
  ["ready", "picked_up"],
];

const isAllowed = (from: OrderStatus, to: OrderStatus) =>
  ALLOWED.some(([f, t]) => f === from && t === to);

/** All 36 ordered pairs of ORDER_STATUSES, x → x included. */
const PAIRS = ORDER_STATUSES.flatMap((from) =>
  ORDER_STATUSES.map((to) => ({ from, to, allowed: isAllowed(from, to) })),
);

describe("canTransition", () => {
  test("the pairs cover all 36 combinations, 8 of them allowed", () => {
    expect(PAIRS).toHaveLength(36);
    expect(PAIRS.filter((p) => p.allowed)).toHaveLength(8);
  });

  test.each(PAIRS)("$from → $to: $allowed", ({ from, to, allowed }) => {
    expect(canTransition(from, to)).toBe(allowed);
  });
});

describe("nextStatuses: the statuses reachable from one, in the order of §8.2", () => {
  test.each([
    { from: "held", expected: ["paid", "expired", "cancelled"] },
    { from: "expired", expected: ["paid", "cancelled"] },
    { from: "paid", expected: ["ready", "picked_up"] },
    { from: "ready", expected: ["picked_up"] },
    { from: "picked_up", expected: [] },
    { from: "cancelled", expected: [] },
  ] satisfies { from: OrderStatus; expected: OrderStatus[] }[])(
    "nextStatuses($from) → $expected",
    ({ from, expected }) => {
      expect(nextStatuses(from)).toEqual(expected);
    },
  );

  test.each(ORDER_STATUSES)("agrees with canTransition for %s", (from) => {
    const reachable = ORDER_STATUSES.filter((to) => canTransition(from, to));
    expect([...nextStatuses(from)].sort()).toEqual([...reachable].sort());
  });
});
