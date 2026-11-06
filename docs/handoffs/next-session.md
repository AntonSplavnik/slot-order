# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0–M2 merged (PRs #1–#3). M3 (Supabase schema, functions, seed, `test:db`) on branch `m3-supabase`: contract
  written (spec §5 functions with `p_now`, row mapping, harness `apps/api/vitest.db.config.ts`, scripts,
  `VAT_RATES_DE_2026`); nothing committed; the test agent writes `apps/api/test/db/` from
  `docs/handoffs/m3-db-tests.md`.
- Local Supabase is running. `supabase login` done (org LazyPixel, no project yet). Still to come from Anton:
  Cloudflare (M4), Stripe (M5).

## Next action
1. If `apps/api/test/db/` exists: `pnpm test:db` (red: no migrations yet), review the tests against §5, commit
   `M3: database tests (red)`.
2. Run the implementer from `docs/handoffs/m3-db-impl.md` (Opus 5.5, xhigh). Review the SQL. `pnpm test:db` green.
   Commit `M3: schema, functions, seed (green)`.
3. CI: turn the "Supabase local (timing)" job into the required `test:db` job (`pnpm install`, `supabase start -x …`,
   `pnpm test:db`). Cloud: `supabase projects create slot-order --org-id rdptzsfolrrzuokfqrfr --region eu-central-1
   --db-password <generated, into the git-ignored .env as SUPABASE_DB_PASSWORD>`, `supabase link`, `supabase db push`;
   `gh secret set SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_ID / SUPABASE_DB_PASSWORD` for M4's deploy job.
   Plan Status → `demo ok, PR open`, push, PR, stop for Anton.

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
