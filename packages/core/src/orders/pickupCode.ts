import { PICKUP_ALPHABET, PickupCodeSchema } from "../schemas/orders";

// Pickup codes (docs/design.md §3 "Pickup code", §8.3). The bytes come from the caller, so core needs no
// platform random source.

const CODE_LENGTH = 8;

/** 8 characters from exactly 8 random bytes (`bytes[i] % 32` into `PICKUP_ALPHABET`), else a RangeError. */
export function pickupCode(bytes: Uint8Array): string {
  if (bytes.length !== CODE_LENGTH) {
    throw new RangeError(`a pickup code needs ${CODE_LENGTH} bytes, got ${bytes.length}`);
  }
  return Array.from(bytes, (byte) => PICKUP_ALPHABET.charAt(byte % 32)).join("");
}

/**
 * What staff typed, canonical: trimmed, upper-cased, I/L → 1, O → 0, spaces and hyphens removed;
 * null unless the result is 8 alphabet characters.
 */
export function normalizePickupCode(text: string): string | null {
  const code = text
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/[ -]/g, "");
  return PickupCodeSchema.safeParse(code).success ? code : null;
}
