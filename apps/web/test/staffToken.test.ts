import { describe, expect, test } from "vitest";
import { clearStaffToken, loadStaffToken, saveStaffToken } from "../src/lib/staffToken";
import { memoryStorage, throwingStorage } from "./helpers";

// docs/design.md §3 "Staff" (the staff pages keep the token in localStorage), §11.1 `/staff` (asked for
// once; a 401 clears it and asks again) and §11.2 `staffToken.ts`.

describe("the staff token in an injected storage (§11.2)", () => {
  test("an empty storage → null", () => {
    expect(loadStaffToken(memoryStorage())).toBeNull();
  });

  test('saved, it loads again, stored under "slot-order.staff-token"', () => {
    const storage = memoryStorage();
    saveStaffToken(storage, "tok");
    expect(loadStaffToken(storage)).toBe("tok");
    expect(storage.getItem("slot-order.staff-token")).not.toBeNull();
  });

  test("a second save replaces the first", () => {
    const storage = memoryStorage();
    saveStaffToken(storage, "old");
    saveStaffToken(storage, "new");
    expect(loadStaffToken(storage)).toBe("new");
  });

  test("cleared → null, the key removed", () => {
    const storage = memoryStorage();
    saveStaffToken(storage, "tok");
    clearStaffToken(storage);
    expect(loadStaffToken(storage)).toBeNull();
    expect(storage.getItem("slot-order.staff-token")).toBeNull();
  });

  // SPEC: §11.2 says nothing about a throwing storage for the token. Decision, as for the cart: loading
  // reads as no token (the page asks for it), saving and clearing do not throw.
  test("a throwing storage: load → null, save and clear do not throw", () => {
    expect(loadStaffToken(throwingStorage())).toBeNull();
    expect(() => saveStaffToken(throwingStorage(), "tok")).not.toThrow();
    expect(() => clearStaffToken(throwingStorage())).not.toThrow();
  });
});
