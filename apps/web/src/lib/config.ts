// docs/design.md §11.2: the API's address, baked in at build time (NEXT_PUBLIC_*). Next inlines the variable only
// when the expression is spelled out literally, so it is read as `process.env.NEXT_PUBLIC_API_URL`, never by key.

const DEFAULT_API_URL = "http://localhost:8787";

/** `NEXT_PUBLIC_API_URL` without a trailing slash; `http://localhost:8787` when unset. */
export function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured === undefined || configured.trim() === "") return DEFAULT_API_URL;
  return configured.trim().replace(/\/+$/, "");
}
