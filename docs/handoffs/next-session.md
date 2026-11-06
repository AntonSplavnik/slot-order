# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0, M1 merged (PRs #1, #2). M2 at `demo ok, PR open` (PR #3), waiting for Anton's review. Nothing of M3 exists.
- Local Supabase is running (`supabase status`). Accounts still to be created by Anton: Supabase (M3 cloud push),
  Cloudflare (M4), Stripe (M5).

## Next action
1. When Anton approves and merges PR #3: `git checkout main && git pull`, set M2 to `merged` in `docs/plan.md`.
2. Start M3 on branch `m3-supabase`: read §3 (rows "Slot rows", "No overbooking", "Holds", "Trust boundary"), §5 in
   full, §8.2 invariant, §13 "Database", §14. Decide the `test:db` harness (Vitest config `apps/api/vitest.db.config.ts`,
   `globalSetup` running `supabase db reset`, `postgres` + `supabase-js` as devDependencies of `apps/api`), write the
   brief `docs/handoffs/m3-db-tests.md` with the exact function signatures of §5 and every expectation, run the test
   agent (Opus 5.5, xhigh), review, commit red; implementer writes the SQL; review; green; CI job; PR; stop.

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
