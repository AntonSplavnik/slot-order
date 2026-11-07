# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0–M3 merged (PRs #1–#4). M4 (Hono API) on branch `m4-api`: contract written (spec §10, `core/src/schemas/api.ts`,
  `apps/api/src/repo/types.ts`, stubs for `createApp`, `runCron`, both repositories); nothing committed yet; the test
  agent writes `apps/api/test/` from `docs/handoffs/m4-api-tests.md`.
- Supabase cloud project `ckvngajrwdijdtjvfblm` live with migrations and seed; GitHub secrets `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` set. `.env` (git-ignored) holds the password, ref and cloud service key.
- Still to come from Anton: Cloudflare (`wrangler login`, needed for M4's deploy), Stripe (M5).

## Next action
1. If `apps/api/test/routes/` exists: `pnpm test` (new tests red), review against §10, fold `// SPEC:` points into
   the spec, commit `M4: API tests (red)`.
2. Implementer from `docs/handoffs/m4-api-impl.md` (Opus 5.5, xhigh). Review. `pnpm test`, `test:db`, `typecheck`,
   `check` green. Commit `M4: Hono API (green)`.
3. Deploy: `pnpm --filter @slot-order/api exec wrangler login` (Anton), then `wrangler secret put
   SUPABASE_SERVICE_ROLE_KEY` (cloud key from `.env`), `STAFF_TOKEN` (generate, store in `.env`), set `SUPABASE_URL`
   and `WEB_ORIGIN` vars for production in `wrangler.toml` (`[env.production]` or top-level), `wrangler deploy`; CI
   deploy job on `main`: `supabase db push --remote`, `wrangler deploy` (secrets `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`). curl demo. Plan Status → `demo ok, PR open`, PR, stop.

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
