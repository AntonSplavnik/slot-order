# SlotOrder

Pre-order and pickup-slot system for a fictional halal chicken restaurant, **Goldhahn**: menu → slot → pay → QR code;
staff board with QR check-in. A public work sample: small scope, tested core, the author in control of what the agents
write.

- **`docs/design.md` is the source of truth.** Read the relevant § before changing behaviour. If the implementation has
  to deviate, update the spec in the same commit and note it under "Spec changes to record" in `docs/plan.md`.
- **`docs/plan.md`** is the build plan: milestones M0–M6 with risk, demo and tests, the workflow, and the status table.
  Keep the status table current.
- **`docs/handoffs/`** holds the briefs for subagents and `next-session.md` for the next context window.
- **`HANDOFF.md`** (repo root) is the private brief behind this project; **`MESSAGE.md`** the note sent with the link. Both are git-ignored. **Nothing committed to this
  repo names the company, the people or the products it was written for.** No real restaurant's name, logo, menu,
  photos or texts; the menu is made up.

## Workflow

1. **Spec first.** A milestone's §-sections exist and are reviewed before its code.
2. **Test first.** Write the milestone's tests, get them reviewed, then implement against them.
3. **Subagents** do independent parts in parallel from a handoff file in `docs/handoffs/`; the orchestrator runs the
   checks, reads every diff, writes the spec back. Subagents never commit, push, touch secrets or CI.
   **Every subagent runs on Opus 5.5** (`model: "opus"`), at `effort: "xhigh"` for hard work (slot and pricing rules,
   SQL functions, the webhook) and `effort: "high"` for the rest (scaffolding, screens, docs). Anton's rule, 2026-11-06.
4. **Review gate.** A milestone ends when `pnpm test`, `pnpm typecheck`, `pnpm check` (and from M3 `pnpm test:db`)
   pass and the demo works. Commit on `m<N>-<name>`, push, open a PR, **stop** for Anton's review. He merges; `main`
   deploys. One milestone at a time. UI and design changes are reviewed on a phone over the LAN (`pnpm dev:phone`)
   before the merge; nothing is deployed by hand to check a look. Anton's rule, 2026-11-08.
5. **"What the agent got wrong and what I changed"** in `README.md`: whenever Anton corrects something the agent did,
   add an entry with the commit. Real examples only.
6. **Context below ~28 %.** Write `docs/handoffs/next-session.md` and start a fresh session rather than let one grow.
7. **Plan status at every step.** After every step change (contract, tests red, implementation green, PR open,
   approved, merged) update the Status table and its "Next action" line in `docs/plan.md`, so a fresh context picks up
   from the current stage without asking. Anton's rule, 2026-11-06.

## Layout

pnpm workspace, TypeScript everywhere, no build step for `core` (the apps import its `src/` directly).

- `packages/core/`: slot rules, pricing, order transitions, pickup codes, Zod schemas for every API shape. **No I/O, no
  Node or DOM APIs** (`types: []` in its tsconfig). `now` is always an argument.
- `apps/api/`: Hono on Cloudflare Workers. The only unit that talks to Supabase (service role) and Stripe. Routes stay
  thin; a `Repository` and a `Payments` interface each have a real and an in-memory implementation.
- `apps/web/`: Next.js App Router + Tailwind. Screens only; talks to the API through `src/lib/api.ts`; prices the cart
  locally with `core`.
- `supabase/`: `config.toml`, numbered SQL migrations, `seed.sql`.
- `.github/workflows/ci.yml`: checks on every push and PR; deploys from `main`.

## Live and secrets

- API: `https://slot-order-api.antonsplavnik.workers.dev` (Cloudflare Worker `slot-order-api`, cron every minute),
  deployed by CI from `main`. Database: Supabase project `slot-order`, ref `ckvngajrwdijdtjvfblm`, Frankfurt.
- Git-ignored on the Mac: `.env` (`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY_CLOUD`,
  `STAFF_TOKEN_PROD`; Stripe keys from M5) and `apps/api/.dev.vars` (local stack key, dev `STAFF_TOKEN`).
  Read them with `set -a; . ./.env; set +a`; never print them.
- GitHub secrets (this repo only): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Worker secrets: `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_TOKEN`.

## Commands

```sh
pnpm install
supabase start                 # local Postgres + PostgREST (Docker)
supabase db reset              # migrations + seed, from scratch; always before a migration reaches a PR
pnpm dev                       # wrangler dev (API, :8787; reads apps/api/.dev.vars) and next dev (web, :3000, M6)
pnpm dev:phone                 # both bound to the Mac's LAN address: review a branch on a phone over Wi-Fi, no deploy
stripe listen --forward-to localhost:8787/webhooks/stripe
pnpm test                      # core + api unit/route tests; no network
pnpm test:db                   # against local Supabase: migrations, functions, 50-parallel reservation, RLS
pnpm typecheck
pnpm check                     # Biome lint + format check (`pnpm format` to fix)
```

## Rules

- **Secrets never enter git.** `.env*` (except `.env.example`), `apps/api/.dev.vars` are ignored; Worker secrets via
  `wrangler secret put`; CI secrets in GitHub. Stripe in **test mode only**.
- Money is integer cents; prices are gross; VAT per line by the rule in §7.4. No floating point in pricing.
- Every API request/response shape is a Zod schema in `core`; routes validate with it.
- Slot capacity is enforced only in Postgres (`reserve_slot`); `core` enforces grid, prep time, cut-off and horizon.
- Every order status change is a conditional `UPDATE … WHERE status = <from>`; `canTransition` in `core` is the table.
- The webhook inserts the Stripe event id before processing; duplicates answer 200 and do nothing.
- RLS is on for every table with no policies; the browser never sees a Supabase key.
- `supabase db push --remote` runs from CI on `main` only (once by hand in M3, with `--include-seed`); the local
  database is `supabase db reset`.
- English everywhere. If time runs short, cut UI, never tests.
