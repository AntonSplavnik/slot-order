import { createClient } from "@supabase/supabase-js";
import { type AppDeps, createApp, runCron } from "./app";
import { parseEnv } from "./env";
import { ApiError } from "./errors";
import { createSupabaseRepository } from "./repo/supabase";

// The Worker (docs/design.md §10.3, §14): AppDeps from the validated environment, with the Supabase
// repository on the service-role client, the real clock and crypto.getRandomValues. Built once per
// environment object and reused across requests.

type Built = { deps: AppDeps; app: ReturnType<typeof createApp> };
const built = new WeakMap<object, Built>();

function build(env: Env): Built {
  const cached = built.get(env);
  if (cached !== undefined) return cached;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STAFF_TOKEN, WEB_ORIGIN } = parseEnv(env);
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps: AppDeps = {
    repo: createSupabaseRepository(client),
    now: () => new Date(),
    staffToken: STAFF_TOKEN,
    webOrigin: WEB_ORIGIN,
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
  };
  const entry = { deps, app: createApp(deps) };
  built.set(env, entry);
  return entry;
}

export default {
  async fetch(request, env, ctx) {
    let app: Built["app"];
    try {
      app = build(env).app;
    } catch (error) {
      // parseEnv names the invalid variables, never their values.
      console.error(error instanceof Error ? error.message : "invalid Worker environment");
      const internal = new ApiError("internal");
      return Response.json(internal.toBody(), { status: internal.status });
    }
    return app.fetch(request, env, ctx);
  },

  // The Cron Trigger (wrangler.toml, every minute): releases expired holds (§8.4 step 1).
  async scheduled(_controller, env) {
    const { released } = await runCron(build(env).deps);
    console.log(`cron: released ${released} expired hold(s)`);
  },
} satisfies ExportedHandler<Env>;
