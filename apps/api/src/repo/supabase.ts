import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "./types";

/** The Supabase repository (§10.2): the service-role client, rows mapped by src/db/rows.ts. Stub until M4. */
export function createSupabaseRepository(_client: SupabaseClient): Repository {
  throw new Error("not implemented: createSupabaseRepository");
}
