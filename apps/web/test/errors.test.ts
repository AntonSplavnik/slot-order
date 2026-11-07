import { ApiErrorCodeSchema } from "@slot-order/core";
import { describe, expect, test } from "vitest";
import type { ApiClientCode } from "../src/lib/api";
import { errorText } from "../src/lib/errors";

// docs/design.md §11.2 `errors.ts` (one sentence per §12 code and the two client codes, a complete map)
// and §11.1 (an API error is shown inline by its code's text).

const ALL_CODES: ApiClientCode[] = [...ApiErrorCodeSchema.options, "network", "invalid_response"];

describe("errorText covers every code (§11.2, §12)", () => {
  test.each(ALL_CODES)("%s → a non-empty text, capitalised, ending with a full stop", (code) => {
    const text = errorText(code);
    expect(text.trim()).toBe(text);
    expect(text.length).toBeGreaterThan(1);
    expect(text).toMatch(/^[A-Z].*\.$/);
    expect(text).not.toBe(code);
  });
});

describe("errorText's pinned wording", () => {
  // SPEC: §11.2 pins no wording for errors.ts; these five are the brief's choice. "network" is two
  // sentences, against §11.2's "one sentence per code"; kept as the brief wrote it.
  test.each<[ApiClientCode, string]>([
    ["slot_full", "That slot is full."],
    ["promo_invalid", "The promo code is not valid."],
    ["network", "The connection failed. Check your network and try again."],
    ["invalid_response", "The server answered something unexpected."],
    ["unauthorized", "The staff token is not valid."],
  ])("%s → %j", (code, text) => {
    expect(errorText(code)).toBe(text);
  });
});
