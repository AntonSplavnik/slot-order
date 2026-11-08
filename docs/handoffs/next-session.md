# Next session

**Written:** 2026-11-08, after PR #11 (design pass 4, the item page) was opened. Start the new session with the
prompt at the end.

## State
- **Merged and live:** M0–M6 (#1–#7), the CI fix #8, PR #9 (design passes 2 and 3, `pnpm dev:phone`), PR #10 (photo
  tiles, the wings cover). CI deploys both Workers from `main` (API `https://slot-order-api.antonsplavnik.workers.dev`,
  web `https://slot-order-web.antonsplavnik.workers.dev`).
- **PR #11 open (2026-11-08), branch `m6-item-page`, waiting for Anton:** design pass 4, `docs/design.md` §11.9.
  Anton's fourth review: the tile's "+" opens the item's page for food and combos (as the reference does), drinks go
  straight into the cart and show a "−" / count / "+" pill once added (his two additions while the work ran, the
  second from a screenshot in `reference/uber-eats-3/`), and more motion, planned with the `improve-animations` and
  `animate` skills (twelve motions M1–M12, three deferred to §16). Commits: the contract `24df842` (§11.9, four
  stubs, 37 red tests, the briefs `docs/handoffs/m6-item-page-prep.md` and `-impl.md`), the green `a1090ec`
  (`ItemPage`, `QuickAddControl`, `Count`, `Tile` size `row`, the theme's curves and keyframes), then the docs
  commit (README's fourth "What the agent got wrong" entry, plan, this file). Checks: core 373, web 275, API 287,
  typecheck, Biome, `next build`, the OpenNext build, the greps (one `truncate`). Renders at 390 × 844 in the
  session scratchpad (gone with it; the DevTools driver scripts too; easy to redo).
- **Anton's review of #11:** on the phone over the LAN (`pnpm dev:phone` on the branch; the §15 issue may still
  block the API from the phone, in which case the laptop's browser at 390 wide). Only a phone can confirm the safe
  areas, the drawer curve, the header crossfade and fast taps on "+". Two calls he can flip without touching the
  library: a drink's **tile** tap adds one (there is no detail page for drinks; "nothing" or "open the page" are the
  alternatives); the item page's "Add a drink" rows carry the same pill as the grid.
- **Open, his call:** descriptions and more option groups for the other dishes so every item page has choices
  (a data change: `supabase/seed.sql`, the core fixture `packages/core/test/fixtures/menu.ts`, and a migration for
  the live database, since the seed was applied once; optional groups only keep every pinned receipt valid); the
  §16 items from the item page reference (the "Complete your order" page, a note field, "More to explore",
  ingredients, share, the back button, drag-to-dismiss); the phone review over the LAN (§15); M7 (POS mock) only
  if he asks.
- **Private files (git-ignored):** `HANDOFF.md`, `MESSAGE.md`, `reference/` (uber-eats, uber-eats-2, uber-eats-3,
  photo-mock). Nothing committed names the company or the reference restaurant.
- **Secrets, all set** (see the previous hand-off's list in git history, `a4c6894`); never printed. Local stack:
  `supabase start` running; port 3000 is held by another project, the web dev server uses 3001.

## How a milestone is run (what worked for M1–M6 and the design passes)
1. **Contract first** (orchestrator, or a prep subagent on Opus `effort: "high"` from a prep brief, as pass 4 did):
   the spec §-section with every number, schemas or stubs so the tests compile, the implementer brief.
2. **Test brief and red tests** (`docs/handoffs/m<N>-<x>-tests.md` or inside the prep brief); the orchestrator
   reviews the titles, folds the agent's findings into the spec and the plan's change log, commits `… (red)`.
3. **Design work:** Anton's design skills (`better-*`, `emil-design-eng`, `mobile-native`; for motion
   `improve-animations` and `animate`) are part of the contract step: load them, review the spec against them,
   write what they change into the spec before the implementer runs.
4. **Implementer agent** (Opus, `effort: "high"` for screens, `"xhigh"` for logic) from the impl brief; may not edit
   tests or configs; reports deviations rather than bending code; follow-ups by `SendMessage` to the same agent.
5. **Review the diff**, run `pnpm test`, `pnpm typecheck`, `pnpm check` (and the builds) yourself, write the
   implementer's decisions into the spec, commit `… (green)`, push, `gh pr create`, update the plan's Status and
   this file, **stop for Anton**. After his merge: `git checkout main && git pull`, Status → merged.
6. Plan Status is updated at **every** step change (Anton's rule), with the "Next action" line.
7. UI and design passes are reviewed on a phone over the LAN before the merge; nothing is deployed by hand.
8. Anton's corrections become README entries ("What the agent got wrong and what I changed", with the commit).

## Next action
Wait for Anton's review of PR #11. If he asks for changes: a follow-up commit on `m6-item-page` (spec first if a
rule changes), push, the PR updates. After his merge: `git checkout main && git pull`, the plan's Status → merged,
check the live site. Then only what he asks for (the data change for descriptions and option groups is the likely
next pass: spec §5 and §11.9 first, the fixture and seed, a migration, tests first).

## Rules in force
Subagents on Opus 5.5, xhigh for logic, high for screens and docs. Plan Status at every step. Spec first, tests
first. Nothing committed names the company or the reference restaurant. Only reviewed work is merged; branches and
PRs per pass. Secrets never printed. Anton cannot open claude.ai artifacts: deliver local HTML files instead.

## Prompt for the new session
```
Read CLAUDE.md, then docs/plan.md (the Status section), then docs/handoffs/next-session.md in full. PR #11 (design
pass 4, the item page) is open on m6-item-page and waits for my review. Continue only with what I ask for, spec
first and tests first, and update the plan's Status table at every step.
```
