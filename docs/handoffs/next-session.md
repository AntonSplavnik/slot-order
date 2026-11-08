# Next session

**Written:** 2026-11-08, after design pass 3 was committed and pushed on `m6-design` (PR #9). Start the new session
with the prompt at the end.

## State
- **Merged and live:** M0–M6 (#1–#7) and the CI fix #8. CI deploys the migrations, the API Worker
  (`https://slot-order-api.antonsplavnik.workers.dev`) and the web Worker
  (`https://slot-order-web.antonsplavnik.workers.dev`) from `main`; verified green on 2026-11-08 (the last run on
  `main` was the `reference/` ignore commit).
- **PR #9 open, branch `m6-design`:** design pass 2 (`b712312`) and **design pass 3** (`514a81a`, 2026-11-08, after
  Anton's third review: "structure right, look too simple; match fonts, shapes and colours exactly"). Pass 3 is
  `docs/design.md` §11.7: tokens measured from the 23 reference screenshots (sampled colours, cap heights, scan
  lines), Figtree via `next/font/google` as the nearest open typeface to the reference's proprietary one, a named
  type scale with unitless line-heights in `globals.css` `@theme`, square tiles, 56 px buttons, 36 px pills, the
  tile's round button showing the cart quantity (`itemQuantity`, 4 tests). Before the implementation Anton
  installed design skills (`better-accessibility`, `better-layout`, `better-writing`, `better-typography`,
  `better-colors`, `better-interface`, `emil-design-eng`, `mobile-native`, `break-ui`, `animate`) and asked for
  the design to be checked with them first; §11.7's review paragraph lists what that changed (the error red,
  truncation, the sheet's focus management and `inert`, `viewportFit: "cover"`, press feedback, names, labels).
  Checks: core 373, web 229, API 287, db 122 (CI), typecheck, Biome (now with `css.parser.tailwindDirectives`),
  `next build`, OpenNext build. The live web Worker still runs pass 2 (Anton's hand deploy `e5f134da`).
- **README:** three "What the agent got wrong and what I changed" entries (bare UI → `a269fcf`; the reference →
  `b712312`; measured exactness and the skill review → `514a81a`).
- **Private files (git-ignored):** `HANDOFF.md` (the brief), `MESSAGE.md` (the LinkedIn note, Anton edits and
  sends it), `reference/uber-eats/` (23 phone screenshots of a real restaurant's store on Uber Eats: type,
  shapes, colours and layout reference only; none of its content, name or photos may enter the repo). Nothing
  committed names the company or the restaurant.
- **Not done, Anton's:** review pass 3 on the phone over the LAN: `pnpm dev:phone` (§15; it prints the URL for a
  phone on the same Wi-Fi; `stripe listen --forward-to localhost:8787/webhooks/stripe` for a paid order), then merge
  PR #9; CI deploys both Workers from `main`. No hand deploy to look at a design any more (Anton's rule,
  2026-11-08; the agent's sandbox refuses production deploys anyway). Send the LinkedIn note. A phone has to confirm
  what emulation cannot: the safe-area insets, no tap flash, no zoom on inputs, the sheet's drawer curve.
- **Open, Anton's call:** stock photos instead of tiles (free licences, small WebP, a `CREDITS.md`); never the
  reference restaurant's photos. §16 notes the reference's always-enabled Add button (validate on submit) as a
  behaviour change for later. M7 (POS mock) only if he asks.
- **Secrets, all set:** GitHub `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; API Worker `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_TOKEN`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; the web Worker needs none (`NEXT_PUBLIC_API_URL` baked in by CI).
  Stripe test mode: webhook endpoint `we_1UZExURpMWMSEzehPxv9ztph`. On the Mac, git-ignored: `.env`,
  `apps/api/.dev.vars`, `apps/web/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:8787`). Logged in:
  `supabase`, `wrangler`, `gh`; the Stripe CLI installed. Secrets are never printed.
- **Local stack:** `supabase start` running under the linked project name (the auxiliary services are stopped on
  purpose); the local database holds one test order from the pass-3 renders (`supabase db reset` clears it).
  Port 3000 is held by another project: `pnpm dev:phone` uses 3001 (and binds both servers to the LAN address). Screens were rendered headless over Chrome's DevTools protocol at 390 × 844
  (the driver script lived in the session scratchpad and is gone; easy to redo).

## How a milestone is run (what worked for M1–M6)
1. **Contract first** (orchestrator): refine the spec §-sections into exact signatures; write the schemas, types and
   throwing stubs so tests compile; typecheck and `pnpm check` must pass.
2. **Test brief** `docs/handoffs/m<N>-<x>-tests.md`: files owned, files forbidden, every expected value precomputed
   (and the instruction to verify numbers against core rather than trust the brief), "Done means".
3. **Test agent** (`Agent`, `subagent_type: general-purpose`, `model: "opus"`, `effort: "xhigh"`), prompt: read the brief
   and follow it; report files, counts, how they fail, `// SPEC:` points.
4. **Review** the report and the test titles; fold `// SPEC:` points into the spec and the plan's change log; append
   them to the implementer brief; commit `M<N>: … tests (red)`.
5. **Implementer agent** (same model; `effort: "high"` for screens) from `docs/handoffs/m<N>-<x>-impl.md`; may not
   edit tests or configs; reports deviations rather than bending code. Follow-ups by `SendMessage` to the same agent.
6. **Review the diff**, run `pnpm test`, `pnpm test:db`, `pnpm typecheck`, `pnpm check` yourself, record the
   implementer's decisions in the spec, commit `M<N>: … (green)`, push the branch, `gh pr create` with the milestone
   body, update the plan's Status table and this file, wait for CI, **stop for Anton**. After his merge:
   `git checkout main && git pull`, Status → `merged`.
7. Plan Status is updated at **every** step change (Anton's rule), with the "Next action" line.
9. UI and design passes are reviewed on a phone over the LAN (`pnpm dev:phone`) before the merge; nothing is
   deployed by hand to check a look (Anton's rule, 2026-11-08).
8. For design work, Anton's design skills are part of the contract step: load them, review the spec and the screens
   against them, write what they change into the spec before the implementer runs.

## Next action
Anton deploys pass 3 by hand and looks at it on the phone. If he asks for changes: a pass-4 §-paragraph in §11.7
first, then the implementer. After his merge of PR #9: `git checkout main && git pull`, plan Status → merged,
confirm CI's deploy of both Workers (`gh run list --branch main`), check the live pages. Then nothing is open unless
he asks: the stock-photo follow-up, the employer's feedback (code changes are README entries), or M7 (POS mock;
spec §16 first, tests first).

## Rules in force
Subagents on Opus 5.5, xhigh for logic (slots, pricing, SQL, payments, webhook), high for routine. Plan Status at every
step. Nothing committed names the company or the reference restaurant (`HANDOFF.md`, `MESSAGE.md`, `reference/`
private, git-ignored). No code before the spec section exists. Only reviewed work is merged; branches and PRs per
milestone. Secrets never printed.

## Prompt for the new session
```
Read CLAUDE.md, then docs/plan.md (the Status section), then docs/handoffs/next-session.md in full. PR #9 (the
design passes) is open for my review; if it is merged, update the Status table and check the deploys from main.
Then continue only with what I ask for, spec first and tests first, and update the plan's Status table at every
step.
```
