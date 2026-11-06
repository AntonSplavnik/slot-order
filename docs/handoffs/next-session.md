# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0–M2 merged (PRs #1–#3). M3 at `demo ok, PR open` (PR #4): schema, functions, seed, row mapping, `test:db`
  (78 green), CI database job. Waiting for Anton's review.
- Supabase cloud project **not created yet**: the CLI needs `--yes` from an agent run, which Anton must authorise. The
  generated DB password is in the git-ignored `.env` (`SUPABASE_DB_PASSWORD`). Org id `rdptzsfolrrzuokfqrfr`.
- Local Supabase is running. Accounts still to come from Anton: Cloudflare (M4), Stripe (M5).

## Next action
1. On Anton's go-ahead: `set -a; . ./.env; set +a; supabase projects create slot-order --org-id rdptzsfolrrzuokfqrfr
   --region eu-central-1 --db-password "$SUPABASE_DB_PASSWORD" --yes`; wait for it to be healthy
   (`supabase projects list`); `supabase link --project-ref <ref>`; `supabase db push`; then
   `gh secret set SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_ACCESS_TOKEN` (from
   `~/.supabase/access-token` or `supabase login`'s token; ask Anton if not on disk). Record in the plan.
2. When Anton approves and merges PR #4: set M3 to `merged`; start M4 on `m4-api`: §10, §12, §8.2, §4 Units are the
   contract; schemas `OrderSummary`, `StaffOrder`, `SlotsResponse`, `Menu` response; the `Repository` and `Payments`
   interfaces with in-memory fakes; brief `docs/handoffs/m4-api-tests.md` (route tests with `app.request()`);
   test agent → red → implementer → green → deploy job in CI (needs Cloudflare) → PR → stop.

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
