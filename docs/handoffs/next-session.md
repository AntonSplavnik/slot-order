# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0–M3 merged (PRs #1–#4). M4 at `demo ok, PR open` (PR #5): routes, both repositories, contract test, CI deploy
  job; the Worker is live at https://slot-order-api.antonsplavnik.workers.dev (secrets set, cron attached).
- Supabase cloud project `ckvngajrwdijdtjvfblm` live; GitHub secrets for Supabase set; `.env` holds the password, ref
  and cloud service key; `apps/api/.dev.vars` holds the local key and a dev `STAFF_TOKEN`.
- Cloudflare: logged in, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set as GitHub secrets. `.env` also holds
  `STAFF_TOKEN_PROD`. Still to come from Anton: Stripe test keys (M5).

## Next action
1. Done: the Worker is deployed and the demo ran against it (see PR #5's comment).
2. Anton reviews and merges PR #5; the deploy job on main must succeed (check the run).
3. M5 (Stripe) on `m5-stripe`: §9, §8.4, §10.2 M5 methods; migration `0003` adds `checkout_url`; `Payments`
   interface + fake; brief `m5-stripe-tests.md`; needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (test mode).

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
