import { describe, expect, test } from "vitest";
import { formatCents } from "../src/lib/money";

// docs/design.md §11.1 (money on the screens, one format everywhere) and §7 (integer cents): German format,
// a comma for the cents and the euro sign after a no-break space.

describe("formatCents (§11.1)", () => {
  test.each<[number, string]>([
    [1290, "12,90 €"],
    [0, "0,00 €"],
    [5, "0,05 €"],
    [2750, "27,50 €"],
    [123456, "1.234,56 €"],
  ])("%i → %j", (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  test("a negative amount (a discount line) keeps its sign", () => {
    expect(formatCents(-129)).toBe("-1,29 €");
  });
});
