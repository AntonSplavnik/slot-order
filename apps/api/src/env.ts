import { z } from "zod";

// The Worker's environment (docs/design.md §10.3): [vars] from wrangler.toml, secrets from
// `wrangler secret put` (locally .dev.vars). The Stripe key must be a test-mode key (§9).

const WorkerEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STAFF_TOKEN: z.string().min(1),
  WEB_ORIGIN: z.url(),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_test_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
});
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

/** The environment, validated; the error names the invalid variables, never their values. */
export function parseEnv(env: unknown): WorkerEnv {
  const result = WorkerEnvSchema.safeParse(env);
  if (!result.success) {
    const names = new Set(result.error.issues.map((issue) => issue.path.join(".")));
    throw new Error(`invalid Worker environment: ${[...names].join(", ")}`);
  }
  return result.data;
}
