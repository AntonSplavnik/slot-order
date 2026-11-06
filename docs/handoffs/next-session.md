# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0 merged (PR #1). Spec, plan and CLAUDE.md approved by Anton.
- M1: the slot tests are committed red; the implementer subagent runs from `docs/handoffs/m1-slot-impl.md`.
- M1 (core slot rules) on branch `m1-slots`: §6.2 of `docs/design.md` is the API contract; `packages/core/src/schemas/slots.ts`
  (types, schemas) and `packages/core/src/slots/index.ts` (stubs that throw) are in place; `date-fns` and `@date-fns/tz`
  added. A subagent (Opus 5.5, xhigh) is writing the tests from `docs/handoffs/m1-slot-tests.md`.
- Nothing of M1 is committed yet. Local Supabase is running (not needed until M3).

## Next action
1. If `packages/core/test/slots/` exists: run `pnpm --filter @slot-order/core test`; every slot test must fail with
   "not implemented". Review the tests against §6 (orders of reasons and errors, the DST numbers of §6.3, the
   "second occurrence" rule). Fix anything wrong by editing the brief and re-running the test agent, not by hand-editing
   around it. Commit: `M1: slot tests (red)`.
2. Run the implementer from `docs/handoffs/m1-slot-impl.md` (Opus 5.5, xhigh). Review its diff. Commit:
   `M1: slot rules (green)`.
3. Checks, demo (`pnpm test` shows the slot suite with the DST tests green), plan Status → `demo ok, PR open`, push
   `m1-slots`, open the PR, stop for Anton's review.

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
