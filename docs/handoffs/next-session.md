# Next session

**Written:** 2026-11-06, during M1. Overwritten at every step change.

## Where things stand
- M0–M3 merged (PRs #1–#4). M4 at `green, PR open` (PR #5): routes, both repositories, contract test, CI deploy
  job. **Not deployed yet:** `wrangler login` has not been run on this Mac.
- Supabase cloud project `ckvngajrwdijdtjvfblm` live; GitHub secrets for Supabase set; `.env` holds the password, ref
  and cloud service key; `apps/api/.dev.vars` holds the local key and a dev `STAFF_TOKEN`.
- Still to come from Anton: Cloudflare login (M4 deploy), Stripe test keys (M5).

## Next action
1. After `wrangler login` (check `pnpm --filter @slot-order/api exec wrangler whoami`): add `STAFF_TOKEN_PROD` to
   `.env` (`openssl rand -base64 24`), in `apps/api`: `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` (the cloud key
   from `.env`) and `wrangler secret put STAFF_TOKEN`; set production vars in `wrangler.toml` (`SUPABASE_URL =
   https://ckvngajrwdijdtjvfblm.supabase.co`, `WEB_ORIGIN` = the future web URL or `http://localhost:3000` for now;
   keep the local values in a `[env.dev]` or via `.dev.vars` override); `wrangler deploy`; curl `/health`, `/menu`,
   `/slots?date=<tomorrow>` on `https://slot-order-api.<account>.workers.dev`; write the URL into README "Live" and
   §14; create a Cloudflare API token (template "Edit Cloudflare Workers") and set `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets; commit, push, plan Status → `demo ok, PR open`.
2. Anton reviews and merges PR #5; the deploy job on main must succeed (check the run).
3. M5 (Stripe) on `m5-stripe`: §9, §8.4, §10.2 M5 methods; migration `0003` adds `checkout_url`; `Payments`
   interface + fake; brief `m5-stripe-tests.md`; needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (test mode).

## Rules in force
Subagents on Opus 5.5, xhigh/high by difficulty. Plan Status updated at every step. Nothing committed names the
company (`HANDOFF.md`, `MESSAGE.md` are private). No code before the spec section exists.
