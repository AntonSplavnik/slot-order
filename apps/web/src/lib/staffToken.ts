import type { StorageLike } from "./cart";

// The staff token in the browser (docs/design.md §3 Staff, §11.2): a throwing storage reads as no token, and
// saving or clearing never throws.

export const STAFF_TOKEN_KEY = "slot-order.staff-token";

export function loadStaffToken(storage: StorageLike): string | null {
  try {
    const token = storage.getItem(STAFF_TOKEN_KEY);
    return token === null || token === "" ? null : token;
  } catch {
    return null;
  }
}

export function saveStaffToken(storage: StorageLike, token: string): void {
  try {
    storage.setItem(STAFF_TOKEN_KEY, token);
  } catch {
    // Storage blocked: the page asks again next time.
  }
}

export function clearStaffToken(storage: StorageLike): void {
  try {
    storage.removeItem(STAFF_TOKEN_KEY);
  } catch {
    // As saveStaffToken.
  }
}
