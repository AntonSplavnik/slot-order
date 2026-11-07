import type { ApiClientCode } from "./api";

// One sentence per error code for the screens (docs/design.md §11.2, §12). Not implemented yet (M6 contract).

export function errorText(_code: ApiClientCode): string {
  throw new Error("not implemented");
}
