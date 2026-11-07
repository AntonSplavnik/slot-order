// docs/design.md §11.2: the API's address, baked in at build time (NEXT_PUBLIC_*). Not implemented yet (M6 contract).

/** `NEXT_PUBLIC_API_URL` without a trailing slash; `http://localhost:8787` when unset. */
export function apiBaseUrl(): string {
  throw new Error("not implemented");
}
