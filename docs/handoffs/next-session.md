# Next session

**Written:** 2026-11-07 after the M5 green commit, while waiting for Anton's Stripe test key. Start the new session
with the prompt at the end.

## State
- **Merged:** M0 (#1), M1 slots (#2), M2 pricing and orders (#3), M3 Supabase (#4), M4 Hono API (#5). `main` is at
  the M4 merge and deployed: API `https://slot-order-api.antonsplavnik.workers.dev` (Worker `slot-order-api`, cron
  every minute), Supabase `slot-order` (ref `ckvngajrwdijdtjvfblm`).
- **M5 on branch `m5-stripe`, pushed, no PR yet:** `f547ed5` "M5: Stripe tests (red)" (the contract: §9 rewritten,
  §9.4 `Payments`, `orders.checkout_url`, `stripe` 23.1.0) and `c9ae8c4` "M5: Stripe (green)". Every check green:
  core 373 (also under `TZ=Europe/Berlin`), API 287, database 122, typecheck, Biome. The migration
  `20261107120000_checkout_url.sql` is applied locally, **not yet in the cloud** (CI pushes it from `main`).
- **Not done for M5:** the Stripe setup (below), the deploy by hand from the branch, the demo, the PR, Anton's review.
- **Not done after M5:** M6 web app, the README's "What the agent got wrong" (still empty: Anton has changed nothing
  so far), `MESSAGE.md`, the CV entry.
- **Secrets:** GitHub `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`; Worker `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_TOKEN`; the Worker secrets
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are **not set yet** (the deployed `main` Worker does not need them;
  the branch's code refuses to start without them, `src/env.ts`). On the Mac, git-ignored: `.env`
  (`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY_CLOUD`, `STAFF_TOKEN_PROD`, and from
  the Stripe setup `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), `apps/api/.dev.vars` (local Supabase, dev
  `STAFF_TOKEN`, Stripe placeholders `sk_test_` / `whsec_` to be filled). Logged in: `supabase`, `wrangler`, `gh`;
  the Stripe CLI is installed.
- **Local stack:** `supabase start` running under the linked project name; `supabase db reset` done with the M5
  migration.

## Stripe setup (the step waiting on Anton)
1. Anton: a Stripe account in test mode (a sandbox); the secret key `sk_test_…` into `.env` as `STRIPE_SECRET_KEY`.
   Never into the chat, a commit or a log.
2. The webhook endpoint `https://slot-order-api.antonsplavnik.workers.dev/webhooks/stripe` with the events
   `checkout.session.completed` and `checkout.session.expired`: either the orchestrator creates it with the Stripe
   CLI (`set -a; . ./.env; set +a; stripe webhook_endpoints create --api-key "$STRIPE_SECRET_KEY" --url … --enabled-events
   checkout.session.completed --enabled-events checkout.session.expired`, the answer's `secret` written into `.env` as
   `STRIPE_WEBHOOK_SECRET` without printing it), or Anton adds it in the dashboard and puts the signing secret into
   `.env`.
3. `set -a; . ./.env; set +a; printf %s "$STRIPE_SECRET_KEY" | pnpm --filter @slot-order/api exec wrangler secret put
   STRIPE_SECRET_KEY` and the same for `STRIPE_WEBHOOK_SECRET`; the test key also into `apps/api/.dev.vars` (its
   `STRIPE_WEBHOOK_SECRET` comes from `stripe listen` when developing locally).
4. Deploy by hand from the branch: `pnpm --filter @slot-order/api exec wrangler deploy` (the cloud database has no
   `checkout_url` column until CI pushes the migration from `main`: run `supabase db push --remote` by hand first, as
   §14 allows for a reviewed migration, or the deployed branch Worker fails on `setCheckout`).
5. Demo per `docs/plan.md` M5 with the script in the session scratchpad or by hand: `POST /orders` → open
   `checkoutUrl` → card `4242 4242 4242 4242` → `GET /orders/:id` is `paid` with a pickup code; the event replayed
   from the Stripe dashboard → `{ duplicate: true }`; an unpaid hold expired by the cron → its session `expired`
   at Stripe. Then the PR (`gh pr create`, the milestone body), plan Status → `demo ok, PR open`, stop.

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

## Next action: finish M5
The Stripe setup above, the deploy by hand, the demo, the PR, stop for Anton's review. After his merge:
`git checkout main && git pull`, Status → `merged`, check the deployed Worker (`/health`, a `POST /orders` with a
real Checkout URL), the cron log in Cloudflare.

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
M5 is green on branch m5-stripe. Continue with next-session.md's "Stripe setup" and "Next action": the keys (ask me
if .env has no STRIPE_SECRET_KEY yet), the Worker secrets, the migration and deploy by hand, the demo, the PR, and
stop for my review. Update the plan's Status table at every step.
```
