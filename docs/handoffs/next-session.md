# Next session

**Written:** 2026-11-08, after design pass 2 was deployed by hand and PR #9 opened. Start the new session with the
prompt at the end.

## State
- **Merged and live:** M0–M6 (#1–#7) and the CI fix #8. CI deploys the migrations, the API Worker
  (`https://slot-order-api.antonsplavnik.workers.dev`) and the web Worker
  (`https://slot-order-web.antonsplavnik.workers.dev`) from `main`; verified green on 2026-11-07.
- **PR #9 open, branch `m6-design`:** design pass 2 (`b712312`): Anton's second review set Uber Eats' standardized
  store layout as the reference, coloured emoji tiles instead of photos (`src/lib/tiles.ts`, 7 tests). CI green on
  the PR (Checks, Database tests). **The live web Worker already runs this branch** (Anton deployed it by hand,
  version `e5f134da`) so he can look at it on the phone; after his merge CI redeploys the same code from `main`.
  Checks: core 373, web 225, API 287, database 122, typecheck, Biome, `next build`, OpenNext build.
- **README:** two "What the agent got wrong and what I changed" entries (the bare UI → polish `a269fcf`; the look
  still short of a real ordering app → the reference and `b712312`). The live URLs and the staff-token note are in.
- **Private files (git-ignored):** `HANDOFF.md` (the brief), `MESSAGE.md` (the LinkedIn note in Anton's framing,
  English and German, with the demo staff token line; he edits and sends it), `reference/` (23 phone screenshots
  of a real restaurant's store on Uber Eats: **layout reference only, none of its content may enter the repo**;
  downscaled copies were in the session scratchpad). Nothing in the repo names the company.
- **Not done, Anton's:** merge PR #9 after his look; send the LinkedIn note. The CV entry is skipped (his CV was
  already sent).
- **Open question (his call):** photos instead of tiles. The orchestrator advised against using the reference
  restaurant's own photos (the brief's "no Nhas photos" rule, copyright, how it reads to their lead developer);
  the legitimate route is a dozen free stock photos (Unsplash or Pexels licences) resized to small WebP files,
  mapped to the seed items, with a `CREDITS.md`; a small follow-up on the same screens if he wants it.
- **Secrets, all set:** GitHub `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; API Worker `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_TOKEN`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; the web Worker needs none (`NEXT_PUBLIC_API_URL` baked in by CI).
  Stripe test mode: webhook endpoint `we_1UZExURpMWMSEzehPxv9ztph`. On the Mac, git-ignored: `.env`
  (`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY_CLOUD`, `STAFF_TOKEN_PROD`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), `apps/api/.dev.vars` (local Supabase, dev `STAFF_TOKEN`, the Stripe
  test key, a placeholder `whsec_`, `WEB_ORIGIN=http://localhost:3000`), `apps/web/.env.local`
  (`NEXT_PUBLIC_API_URL=http://localhost:8787`). Logged in: `supabase`, `wrangler`, `gh`; the Stripe CLI installed.
  **The agent's sandbox refuses production deploys** (`supabase db push --remote`, `wrangler deploy`, the OpenNext
  deploy) and refused subagents' edits to production config: Anton runs deploys with the `!` prefix, one line,
  `!` as the first character, no leading `NAME=value`: `! cd apps/web &&
  NEXT_PUBLIC_API_URL=https://slot-order-api.antonsplavnik.workers.dev pnpm run deploy` (web) and
  `! pnpm --filter @slot-order/api exec wrangler deploy` (API).
- **Local stack:** `supabase start` running under the linked project name; port 3000 may be held by another project
  (`language-app`): `next dev -p 3001` plus `wrangler dev --var WEB_ORIGIN:http://localhost:3001` works. Screens
  were rendered headless with a script in the session scratchpad (gone with the session; easy to redo with
  Chrome's remote debugging at 390×844, stubbing the order and staff answers).

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

## Next action
After Anton merges PR #9: `git checkout main && git pull`, delete nothing remote, plan Status → design pass merged,
confirm CI's deploy of both Workers (`gh run list --branch main`), check the live pages. Then nothing is open
unless he asks: the stock-photo follow-up, the employer's feedback (code changes are README entries), or M7 (POS
mock; spec §16 first, tests first).

## Rules in force
Subagents on Opus 5.5, xhigh for logic (slots, pricing, SQL, payments, webhook), high for routine. Plan Status at every
step. Nothing committed names the company (`HANDOFF.md`, `MESSAGE.md` private, git-ignored). No code before the spec
section exists. Only reviewed work is merged; branches and PRs per milestone. Secrets never printed.

## Prompt for the new session
```
Read CLAUDE.md, then docs/plan.md (the Status section), then docs/handoffs/next-session.md in full. PR #9 (the
design pass) is open for my review; if it is merged, update the Status table and check the deploys from main.
Then continue only with what I ask for, spec first and tests first, and update the plan's Status table at every
step.
```
