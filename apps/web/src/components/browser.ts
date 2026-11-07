import { ApiClientError, createApi } from "@/lib/api";
import type { StorageLike } from "@/lib/cart";
import { apiBaseUrl } from "@/lib/config";
import { errorText } from "@/lib/errors";

// What the screens inject into the library (docs/design.md §11.2): the API client on the baked-in address over
// the browser's fetch, `localStorage`, Berlin's today, and an error's text.

/** The one client of the app (§11.2 `api.ts`). */
export const api = createApi(apiBaseUrl(), (input, init) => fetch(input, init));

/** Used when reading `window.localStorage` itself throws (site data blocked): the state lives in memory. */
const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
  removeItem: (key) => {
    memory.delete(key);
  },
};

export function browserStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return memoryStorage;
  }
}

const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in the restaurant's time zone as "YYYY-MM-DD" (§6: days are Berlin days). */
export function berlinToday(now: Date = new Date()): string {
  return BERLIN_DAY.format(now);
}

/** The text a screen shows for a failure (§11.2 `errors.ts`). */
export function messageOf(error: unknown): string {
  return error instanceof ApiClientError ? errorText(error.code) : errorText("internal");
}
