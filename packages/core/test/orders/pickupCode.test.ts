import { describe, expect, test } from "vitest";
import {
  normalizePickupCode,
  PICKUP_ALPHABET,
  PickupCodeSchema,
  pickupCode,
} from "../../src/index";

// docs/design.md §3 "Pickup code", §8.3: pickupCode maps exactly 8 bytes, each `bytes[i] % 32`, into Crockford's
// base32 alphabet (no I, L, O, U); normalizePickupCode turns what staff typed into that canonical form.

/** mulberry32: a small seeded PRNG returning uint32s (no Math.random: the same codes on every run). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** What pickupCode throws for `bytes`; an error other than a RangeError (or none) fails the test as it is. */
function rangeError(bytes: Uint8Array): RangeError {
  try {
    pickupCode(bytes);
  } catch (error) {
    if (error instanceof RangeError) return error;
    throw error;
  }
  throw new Error("expected pickupCode to throw a RangeError, it returned a code");
}

describe("pickupCode", () => {
  test.each([
    { bytes: [0, 1, 2, 3, 4, 5, 6, 7], code: "01234567" },
    { bytes: [10, 11, 12, 13, 14, 15, 16, 17], code: "ABCDEFGH" },
    { bytes: [18, 19, 20, 21, 22, 23, 24, 25], code: "JKMNPQRS" },
    // 32 % 32 = 0, 255 % 32 = 31.
    { bytes: [26, 27, 28, 29, 30, 31, 32, 255], code: "TVWXYZ0Z" },
  ])("$bytes → $code", ({ bytes, code }) => {
    expect(pickupCode(Uint8Array.of(...bytes))).toBe(code);
  });

  test.each([0, 7, 9, 16])("%i bytes → RangeError", (length) => {
    expect(rangeError(new Uint8Array(length))).toBeInstanceOf(RangeError);
  });

  describe("10 000 codes from seeded random bytes", () => {
    const next = mulberry32(20261106);
    const draws = Array.from({ length: 10_000 }, () =>
      Uint8Array.from({ length: 8 }, () => next() & 0xff),
    );

    test("are all distinct", () => {
      const codes = draws.map((bytes) => pickupCode(bytes));
      expect(new Set(codes).size).toBe(10_000);
    });

    test("all match PickupCodeSchema and contain no I, L, O or U", () => {
      for (const bytes of draws) {
        const code = pickupCode(bytes);
        expect(PickupCodeSchema.safeParse(code).success, code).toBe(true);
        expect(code, code).not.toMatch(/[ILOU]/);
      }
    });

    test("are bytes[i] % 32 into the alphabet, character by character", () => {
      for (const bytes of draws) {
        const expected = Array.from(bytes, (b) => PICKUP_ALPHABET[b % 32]).join("");
        expect(pickupCode(bytes)).toBe(expected);
      }
    });
  });
});

describe("normalizePickupCode", () => {
  test.each([
    {
      text: " ab-cd ef12 ",
      expected: "ABCDEF12",
      why: "trimmed, upper-cased, hyphens and spaces removed",
    },
    { text: "1L0O1234", expected: "11001234", why: "L becomes 1, O becomes 0" },
    { text: "iIlLoO12", expected: "11110012", why: "i, I, l, L become 1; o, O become 0" },
    { text: "01234567", expected: "01234567", why: "already canonical" },
  ])("'$text' → '$expected' ($why)", ({ text, expected }) => {
    expect(normalizePickupCode(text)).toBe(expected);
  });

  test.each([
    { text: "ABCDEFG", why: "7 characters" },
    { text: "ABCDEFGU", why: "U is not in the alphabet" },
    { text: "ABCDEF123", why: "9 characters" },
    { text: "", why: "empty" },
  ])("'$text' → null ($why)", ({ text }) => {
    expect(normalizePickupCode(text)).toBeNull();
  });

  test("a normalized code matches PickupCodeSchema", () => {
    const code = normalizePickupCode(" tvwx-yz0z ");
    expect(code).toBe("TVWXYZ0Z");
    expect(PickupCodeSchema.safeParse(code).success).toBe(true);
  });
});

describe("PickupCodeSchema (the canonical form)", () => {
  test("accepts 8 alphabet characters", () => {
    expect(PickupCodeSchema.safeParse("0123ABYZ").success).toBe(true);
  });

  test.each(["ABCDEFGI", "ABCDEFGL", "ABCDEFGO", "ABCDEFGU", "abcdefgh", "ABCDEFG", "ABCDEFGHJ"])(
    "refuses %s",
    (text) => {
      expect(PickupCodeSchema.safeParse(text).success).toBe(false);
    },
  );
});
