# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0–M2 merged (PRs #1–#3). M3 at `demo ok, PR open` (PR #4): schema, functions, seed, row mapping, `test:db`
  (78 green), CI database job. Waiting for Anton's review.
- Supabase cloud project `slot-order` (ref `ckvngajrwdijdtjvfblm`, Frankfurt) created and linked 2026-11-07; migrations
  and the seed pushed; `.env` (git-ignored) holds `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`,
  `SUPABASE_SERVICE_ROLE_KEY_CLOUD`. GitHub secrets set: `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`. Missing:
  `SUPABASE_ACCESS_TOKEN` (Anton creates a token and runs `gh secret set SUPABASE_ACCESS_TOKEN`).
- Local Supabase is running. Accounts still to come from Anton: Cloudflare (M4), Stripe (M5).

## Next action
1. Make sure `SUPABASE_ACCESS_TOKEN` is set as a GitHub secret before M4's deploy job runs.
2. When Anton approves and merges PR #4: set M3 to `merged`; start M4 on `m4-api`: §10, §12, §8.2, §4 Units are the
   contract; schemas `OrderSummary`, `StaffOrder`, `SlotsResponse`, `Menu` response; the `Repository` and `Payments`
   interfaces with in-memory fakes; brief `docs/handoffs/m4-api-tests.md` (route tests with `app.request()`);
   test agent → red → implementer → green → deploy job in CI (needs Cloudflare) → PR → stop.

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
