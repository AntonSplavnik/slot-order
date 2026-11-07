import type { StorageLike } from "./cart";

// The staff token in the browser (docs/design.md §3 Staff, §11.2). Not implemented yet (M6 contract).

export const STAFF_TOKEN_KEY = "slot-order.staff-token";

export function loadStaffToken(_storage: StorageLike): string | null {
  throw new Error("not implemented");
}

export function saveStaffToken(_storage: StorageLike, _token: string): void {
  throw new Error("not implemented");
}

export function clearStaffToken(_storage: StorageLike): void {
  throw new Error("not implemented");
}
