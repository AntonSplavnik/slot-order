# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0 merged (PR #1). M1 at `demo ok, PR open` (PR #2), waiting for Anton's review. Nothing of M2 exists yet.
- Local Supabase is running (not needed until M3). Accounts still to be created by Anton: Supabase (M3),
  Cloudflare (M4), Stripe (M5).

## Next action
1. When Anton approves and merges PR #2: `git checkout main && git pull`, set M1 to `merged` in `docs/plan.md`.
2. Start M2 on branch `m2-pricing`: read §7 and §8.1–8.2; write `src/schemas/{menu,cart,receipt,orders}.ts` and
   stubs in `src/pricing/index.ts`, `src/orders/index.ts`; the fixture menu of §5 Seed as `test/fixtures/menu.ts`
   is part of the test agent's job; write `docs/handoffs/m2-pricing-tests.md` in the style of
   `m1-slot-tests.md` (every number precomputed, the §7.4 worked example included); run the test agent, review,
   commit red; run the implementer from `m2-pricing-impl.md`; review; commit green; PR; stop.

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
