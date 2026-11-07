"use client";

import { useCallback, useEffect, useState } from "react";
import { clearStaffToken, loadStaffToken, saveStaffToken } from "@/lib/staffToken";
import { browserStorage } from "./browser";

// The staff token of the staff pages (docs/design.md §3 Staff, §11.1): read once from `localStorage`; a 401
// clears it and the page asks again.

export type StaffToken = {
  /** `undefined` until read (after the first render), `null` when there is none. */
  token: string | null | undefined;
  save: (token: string) => void;
  clear: () => void;
};

export function useStaffToken(): StaffToken {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => setToken(loadStaffToken(browserStorage())), []);
  const save = useCallback((next: string) => {
    saveStaffToken(browserStorage(), next);
    setToken(next);
  }, []);
  const clear = useCallback(() => {
    clearStaffToken(browserStorage());
    setToken(null);
  }, []);
  return { token, save, clear };
}
