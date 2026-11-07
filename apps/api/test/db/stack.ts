import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Where the local Supabase stack is and its keys, for setup.ts and helpers.ts. No side effects on import.

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export type Stack = { dbUrl: string; apiUrl: string; anonKey: string; serviceRoleKey: string };

/** The stack as `supabase status` prints it; `TEST_DATABASE_URL` and `SUPABASE_URL` override the URLs. */
export function localStack(): Stack {
  const json = execFileSync("supabase", ["status", "-o", "json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = JSON.parse(json) as Record<
    "DB_URL" | "API_URL" | "ANON_KEY" | "SERVICE_ROLE_KEY",
    string
  >;
  return {
    dbUrl: process.env.TEST_DATABASE_URL ?? status.DB_URL,
    apiUrl: process.env.SUPABASE_URL ?? status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  };
}
