import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Vitest globalSetup of `pnpm test:db` (docs/design.md §13 Database): rebuilds the local database from the
// migrations and the seed, so every run proves they apply from scratch and starts from the same state.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function setup(): void {
  try {
    execFileSync("supabase", ["db", "reset"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const { message, stdout, stderr } = error as Error & { stdout?: string; stderr?: string };
    throw new Error(
      `supabase db reset failed in ${REPO_ROOT} (is the stack running? \`supabase start\`)\n` +
        `${message}\n${stdout ?? ""}\n${stderr ?? ""}`,
      { cause: error },
    );
  }
}
