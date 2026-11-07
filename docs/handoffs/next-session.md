# Next session

**Written:** 2026-11-07 after the M6 merge. Start the new session with the prompt at the end.

## State
- **Merged:** M0 (#1), M1 slots (#2), M2 pricing and orders (#3), M3 Supabase (#4), M4 Hono API (#5), M5 Stripe
  (#6, `73666a1`; CI deployed `main`, green).
- **M6 merged** (#7, `648edc6`): the web app on Workers (`https://slot-order-web.antonsplavnik.workers.dev`), the
  API's `WEB_ORIGIN` pointing at it, the CI deploy step for the web. Anton ran the whole flow on the phone and asked
  for a less bare UI; the polish pass `a269fcf` answered it and is the README's first "What the agent got wrong and
  what I changed" entry. Every check green: core 373 (also under `TZ=Europe/Berlin`), web 218, API 287, database
  122, typecheck, Biome, `next build`, the OpenNext build. CI deploys both Workers from `main`.
- **Not done:** only the check of the first CI web deploy from `main` after PR #8 (`30637ad`, the `run deploy` fix),
  and Anton sending the LinkedIn note (`MESSAGE.md`, private, drafted in his framing in both languages). The CV
  entry is skipped (his CV was already sent). M7 (POS mock) only if he asks.
- **Secrets, all set:** GitHub `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; Worker (API) `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_TOKEN`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; the web Worker needs none (`NEXT_PUBLIC_API_URL` is baked in by the
  CI step). Stripe test mode: the webhook endpoint `we_1UZExURpMWMSEzehPxv9ztph`. On the Mac, git-ignored: `.env`
  (`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY_CLOUD`, `STAFF_TOKEN_PROD`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), `apps/api/.dev.vars` (local Supabase, dev `STAFF_TOKEN`, the Stripe
  test key, a placeholder `whsec_`, `WEB_ORIGIN=http://localhost:3000`), `apps/web/.env.local`
  (`NEXT_PUBLIC_API_URL=http://localhost:8787`). Logged in: `supabase`, `wrangler`, `gh`; the Stripe CLI installed.
  **The agent's sandbox refuses production deploys, and production config edits for subagents** (`supabase db push
  --remote`, `wrangler deploy`, the OpenNext deploy): Anton runs them with the `!` prefix (one line, `!` first; a
  leading `NAME=value` does not work, `cd apps/web && NAME=value pnpm run deploy` does).
- **Local stack:** `supabase start` running under the linked project name; port 3000 may be held by another project
  (`language-app`): `next dev --port 3001` plus `wrangler dev --var WEB_ORIGIN:http://localhost:3001` works.

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

## Next action: close out
Confirm the CI web deploy from `main` worked (the Deploy job's "Deploy the web Worker" step, then the live
pages); keep the plan's Status table current. Nothing else is open unless Anton asks for M7 or for changes after
the employer's feedback (each of those is an entry for the README's "What the agent got wrong").

## After M6
The README's final sections (the "What the agent got wrong" entries only from Anton's real corrections; the live
URLs are in), `MESSAGE.md` (private, git-ignored), the production check of the whole flow against the live URLs
with a webhook event replayed from the Stripe dashboard, the CV entry. M7 (POS adapter) only if time is left,
spec §16 first.

## Rules in force
Subagents on Opus 5.5, xhigh for logic (slots, pricing, SQL, payments, webhook), high for routine. Plan Status at every
step. Nothing committed names the company (`HANDOFF.md`, `MESSAGE.md` private, git-ignored). No code before the spec
section exists. Only reviewed work is merged; branches and PRs per milestone. Secrets never printed.

## Prompt for the new session
```
Read CLAUDE.md, then docs/plan.md (the Status section and "After M6"), then docs/handoffs/next-session.md in full.
M0–M6 are merged and deployed and the close-out is done unless the hand-off says otherwise. Continue with what I
ask for (feedback from the employer, M7 if I want it), spec first, tests first, and update the plan's Status table
at every step.
```
