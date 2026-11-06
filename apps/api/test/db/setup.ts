import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { localStack, REPO_ROOT, type Stack } from "./stack";

// Vitest globalSetup of `pnpm test:db` (docs/design.md §13 Database): rebuilds the local database from the
// migrations and the seed, so every run proves they apply from scratch and starts from the same state.

export default async function setup(): Promise<void> {
  resetDatabase();
  await warmUpPostgrest(localStack());
}

function resetDatabase(): void {
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

const WARM_UP_DEADLINE_MS = 60_000;
const WARM_UP_ROUND = 20;

/**
 * The reset restarts Postgres but not PostgREST, whose pooled connections go stale: until it has replaced
 * them, requests answer 503 ("Database client error. Retrying the connection."). Rounds of parallel reads
 * until a whole round answers 200, so the first test's burst of rpc calls meets a fresh pool.
 */
async function warmUpPostgrest(stack: Stack): Promise<void> {
  const url = `${stack.apiUrl}/rest/v1/settings?select=id`;
  const headers = { apikey: stack.serviceRoleKey, Authorization: `Bearer ${stack.serviceRoleKey}` };
  const deadline = Date.now() + WARM_UP_DEADLINE_MS;
  let last = "no round ran";
  while (Date.now() < deadline) {
    const statuses = await Promise.all(
      Array.from({ length: WARM_UP_ROUND }, async () => {
        try {
          const response = await fetch(url, { headers });
          await response.arrayBuffer();
          return String(response.status);
        } catch (error) {
          return String(error);
        }
      }),
    );
    if (statuses.every((status) => status === "200")) return;
    last = statuses.find((status) => status !== "200") ?? last;
    await sleep(1_000);
  }
  throw new Error(`PostgREST at ${url} did not warm up within 60 s; last answer: ${last}`);
}
