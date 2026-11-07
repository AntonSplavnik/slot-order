# Next session

**Written:** 2026-11-07 after the M5 demo, with PR #6 open for Anton's review. Start the new session with the prompt
at the end.

## State
- **Merged:** M0 (#1), M1 slots (#2), M2 pricing and orders (#3), M3 Supabase (#4), M4 Hono API (#5). `main` is at
  the M4 merge and deployed: API `https://slot-order-api.antonsplavnik.workers.dev` (Worker `slot-order-api`, cron
  every minute), Supabase `slot-order` (ref `ckvngajrwdijdtjvfblm`).
- **M5 on branch `m5-stripe`, PR #6 open, waiting for Anton's review:** `f547ed5` "M5: Stripe tests (red)",
  `c9ae8c4` "M5: Stripe (green)", docs commits after. Every check green: core 373 (also under `TZ=Europe/Berlin`),
  API 287, database 122, typecheck, Biome. The migration `20261107120000_checkout_url.sql` is applied locally
  **and in the cloud** (pushed by hand by Anton for the demo). The branch's Worker is **deployed** (by hand, version
  `8703a753`); the demo passed (plan Status row M5). After the merge, CI redeploys `main` (same code).
- **Not done after M5:** M6 web app, the README's "What the agent got wrong" (still empty: Anton has changed nothing
  so far), `MESSAGE.md`, the CV entry.
- **Secrets, all set:** GitHub `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; Worker `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_TOKEN`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Stripe test mode: the webhook endpoint
  `we_1UZExURpMWMSEzehPxv9ztph` for `/webhooks/stripe` (events `checkout.session.completed`,
  `checkout.session.expired`). On the Mac, git-ignored: `.env` (`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`,
  `SUPABASE_SERVICE_ROLE_KEY_CLOUD`, `STAFF_TOKEN_PROD`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`),
  `apps/api/.dev.vars` (local Supabase, dev `STAFF_TOKEN`, the Stripe test key; its `STRIPE_WEBHOOK_SECRET` is still
  the placeholder: `stripe listen --print-secret` gives the local one). Logged in: `supabase`, `wrangler`, `gh`; the
  Stripe CLI is installed. **The agent's sandbox refuses production deploys** (`supabase db push --remote`,
  `wrangler deploy`): Anton runs them with the `!` prefix when a branch must be deployed before its merge.
- **Local stack:** `supabase start` running under the linked project name; `supabase db reset` done with the M5
  migration.

## Stripe setup (done 2026-11-07)
The test key in `.env`; the endpoint created with the Stripe API (`curl -u "$STRIPE_SECRET_KEY:"
https://api.stripe.com/v1/webhook_endpoints -d url=… -d "enabled_events[]=…"`), its `secret` written into `.env`
without printing; `printf %s "$STRIPE_SECRET_KEY" | wrangler secret put STRIPE_SECRET_KEY` and the same for the
webhook secret. Demo tools used (session scratchpad, not in the repo): a script placing an order on the live API and
printing its Checkout URL, Anton paying with `4242 4242 4242 4242` in his browser (the Chrome extension was not
connected), a replay script signing a fetched event with the endpoint's secret (`t=…,v1=HMAC-SHA256`) and posting
it with curl (Python's urllib gets Cloudflare's 403 on `workers.dev`), and Stripe's API to read session statuses.
Expect the post-payment redirect to `WEB_ORIGIN` (`http://localhost:3000`) to fail until M6 exists.

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

## Next action: after Anton's review of PR #6
If he asks for changes: make them on `m5-stripe`, push, and add an entry to the README's "What the agent got wrong
and what I changed" with the commit. After his merge: `git checkout main && git pull`, plan Status → `merged`, check
the deployed Worker (`/health`, a `POST /orders` answering a Checkout URL), then start M6 per `docs/plan.md`.

## After M5
M6 (web app) per the plan; then the README's final sections, `MESSAGE.md` (private, git-ignored), the CV entry
(`~/Documents/Job/pipeline/profile.yaml`), a production check of the whole flow.

## Rules in force
Subagents on Opus 5.5, xhigh for logic (slots, pricing, SQL, payments, webhook), high for routine. Plan Status at every
step. Nothing committed names the company (`HANDOFF.md`, `MESSAGE.md` private, git-ignored). No code before the spec
section exists. Only reviewed work is merged; branches and PRs per milestone. Secrets never printed.

## Prompt for the new session
```
Read CLAUDE.md, then docs/plan.md (the Status section and "M6: Web"), then docs/handoffs/next-session.md in full.
PR #6 (M5, Stripe) is open for my review; if it is merged, update the Status table and start M6 as the plan lists
it: contract in §11 first, the test brief, the test agent (Opus 5.5, high), review, red commit, the implementer,
review, green, the OpenNext deploy, demo, PR, and stop for my review. Update the plan's Status table at every step.
```
