# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0 and M1 merged (PRs #1, #2). M2 (pricing, orders) on branch `m2-pricing`: contract written (spec §7.6, §8.3;
  schemas; stubs), nothing committed yet; the test agent is writing `test/pricing/`, `test/orders/`,
  `test/fixtures/menu.ts` from `docs/handoffs/m2-pricing-tests.md`.
- Local Supabase is running (not needed until M3). Accounts still to be created by Anton: Supabase (M3),
  Cloudflare (M4), Stripe (M5).

## Next action
1. If the test files exist: `pnpm --filter @slot-order/core test` — new tests red on "not implemented", schema tests
   may pass, slot suite green. Review against §7/§8; fold `// SPEC:` points into the spec; commit
   `M2: pricing and orders tests (red)`.
2. Run the implementer from `docs/handoffs/m2-pricing-impl.md` (Opus 5.5, xhigh). Review. Commit
   `M2: pricing and orders (green)`.
3. Checks (`test`, `test:berlin`, `typecheck`, `check`), demo (a test prints the §7.4 receipt), plan Status →
   `demo ok, PR open`, push, PR, stop for Anton.

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
