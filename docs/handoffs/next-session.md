# Next session

**Written:** 2026-11-07 after M4 was merged and deployed. Start the new session with the prompt at the end.

## State
- **Merged:** M0 (#1), M1 slots (#2), M2 pricing and orders (#3), M3 Supabase (#4), M4 Hono API (#5). `main` is at
  the M4 merge; CI on `main` ran checks, database tests, `supabase db push --remote` and `wrangler deploy`, all green.
- **Live:** API `https://slot-order-api.antonsplavnik.workers.dev` (Worker `slot-order-api`, cron `* * * * *`,
  secrets `SUPABASE_SERVICE_ROLE_KEY` and `STAFF_TOKEN` set; the production cron verified: a demo hold flipped to
  `expired` at its 10-minute mark). Database: Supabase `slot-order`, ref
  `ckvngajrwdijdtjvfblm`, migrations and seed applied, RLS verified from outside.
- **Tests:** core 373, API routes 171, database 116 (78 schema/functions + 38 repository contract); the same contract
  runs against the in-memory repository in `pnpm test`. All green under `TZ=UTC` and `TZ=Europe/Berlin`.
- **Secrets, all set:** GitHub `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. On the Mac, git-ignored: `.env` (`SUPABASE_DB_PASSWORD`,
  `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY_CLOUD`, `STAFF_TOKEN_PROD`), `apps/api/.dev.vars` (local
  `SUPABASE_URL`, local `SUPABASE_SERVICE_ROLE_KEY`, dev `STAFF_TOKEN`). Logged in: `supabase`, `wrangler`, `gh`.
- **Not done yet:** M5 Stripe, M6 web app, the README's "What the agent got wrong" section (still empty: Anton has
  changed nothing so far; the honest entries so far are what the agents caught in the orchestrator's briefs and the
  spec, listed in `docs/plan.md` "Spec changes to record"), `MESSAGE.md`, the CV entry.
- **Local stack:** `supabase start` is running under the linked project name; `supabase status` works.
- **Anton still has to provide for M5:** a Stripe account in test mode, `STRIPE_SECRET_KEY`, and the webhook signing
  secret for the endpoint `https://slot-order-api.antonsplavnik.workers.dev/webhooks/stripe` (see `docs/plan.md` M5,
  "Stripe setup"). Ask for them when the contract is written, not before.

## How a milestone is run (what worked for M1–M4)
1. **Contract first** (orchestrator): refine the spec §-sections into exact signatures; write the schemas, types and
   throwing stubs so tests compile; typecheck and `pnpm check` must pass.
2. **Test brief** `docs/handoffs/m<N>-<x>-tests.md`: files owned, files forbidden, every expected value precomputed
   (and the instruction to verify numbers against core rather than trust the brief), "Done means".
3. **Test agent** (`Agent`, `subagent_type: general-purpose`, `model: "opus"`, `effort: "xhigh"`), prompt: read the brief
   and follow it; report files, counts, how they fail, `// SPEC:` points.
4. **Review** the report and the test titles; fold `// SPEC:` points into the spec and the plan's change log; append
   them to the implementer brief; commit `M<N>: … tests (red)`.
5. **Implementer agent** (same model/effort) from `docs/handoffs/m<N>-<x>-impl.md`; may not edit tests; reports
   deviations rather than bending code. Follow-ups by `SendMessage` to the same agent.
6. **Review the diff**, run `pnpm test`, `pnpm test:db`, `pnpm typecheck`, `pnpm check` yourself, record the
   implementer's decisions in the spec, commit `M<N>: … (green)`, push the branch, `gh pr create` with the milestone
   body (risk removed, tests first, what the agents caught, demo, checks), update the plan's Status table and this
   file, wait for CI, **stop for Anton**. After his merge: `git checkout main && git pull`, Status → `merged`.
7. Plan Status is updated at **every** step change (Anton's rule), with the "Next action" line.

## Next action: M5 (Stripe), branch `m5-stripe`
Follow `docs/plan.md` "M5: Stripe" literally. In order:
1. `git checkout main && git pull && git checkout -b m5-stripe`; Status row M5 → `contract being written`.
2. Research (WebSearch or the docs) the four M5 items in the plan; write the answers into §17 and §14.
3. Contract: refine §9 in `docs/design.md` (keep the existing text, add §9.4 "API": the `Payments` interface, the
   `StripeEvent` subset, the fake's abilities), add `checkout_url` to §5 `orders`, `Order.checkoutUrl`/`setCheckout`
   in §10.2, `AppDeps.payments` in §10.3. Code: `apps/api/src/payments/types.ts`, stubs `stripe.ts` and `fake.ts`
   (throwing), the migration file, `Order.checkoutUrl` in `repo/types.ts`, `STRIPE_*` in `src/env.ts`'s schema.
   Typecheck must pass (the existing memory/supabase repositories need the one new field).
4. Test brief `docs/handoffs/m5-stripe-tests.md` from the plan's "Tests first" list, with the exact expectations
   (status codes, codes, which repository calls happen, counts). Test agent → review → red commit.
5. Implementer brief `docs/handoffs/m5-stripe-impl.md` → implementer → review → green.
6. Stripe setup with Anton (keys into `.env`, `wrangler secret put STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`,
   `.dev.vars` for local, the dashboard webhook endpoint), deploy from the branch by hand once for the demo, run the
   demo (test card), PR, stop.

## After M5
M6 (web app) per the plan; then the README's final sections, `MESSAGE.md` (private, git-ignored), the CV entry
(`~/Documents/Job/pipeline/profile.yaml`), a production check of the whole flow.

## Rules in force
Subagents on Opus 5.5, xhigh for logic (slots, pricing, SQL, payments, webhook), high for routine. Plan Status at every
step. Nothing committed names the company (`HANDOFF.md`, `MESSAGE.md` private, git-ignored). No code before the spec
section exists. Only reviewed work is merged; branches and PRs per milestone. Secrets never printed.

## Prompt for the new session
```
Read CLAUDE.md, then docs/plan.md (the Status section and "M5: Stripe"), then docs/handoffs/next-session.md in full.
Continue with M5 exactly as next-session.md's "Next action" lists it: research, contract in the spec and stubs, the
test brief, the test agent (Opus 5.5, xhigh), review, red commit, the implementer, review, green, then ask me for
the Stripe test keys, deploy, demo, PR, and stop for my review. Update the plan's Status table at every step.
```
