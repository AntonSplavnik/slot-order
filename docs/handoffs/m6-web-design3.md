# M6 brief: design pass 3, the reference's type, shapes and colours (Anton's third review)

Anton looked at design pass 2 on the phone: the structure matches the reference, the look does not ("too simple").
This pass makes **the typeface, the shapes and the colours match the reference screenshots exactly**, as measured
and written down in **`docs/design.md` §11.7** (the contract of this pass: every token, size and radius). You
restyle `apps/web` to §11.7 without changing what the screens do. One small behaviour is added at the library
level (`itemQuantity`, below).

## Reference
- The 23 phone screenshots of a real restaurant's store on Uber Eats (**layout, type, shapes and colours only;
  no name, dish, description, photo, address or phone from them may appear anywhere in the repo**, in code,
  comments, tests, docs or commit messages):
  `/Users/antonsplavnik/Documents/Programming/Projects/slot-order/reference/uber-eats/IMG_57*.PNG` (1284 × 2778,
  3×; git-ignored). Downscaled copies and a labelled contact sheet:
  `/private/tmp/claude-501/-Users-antonsplavnik-Documents-Programming-Projects-slot-order/a3e11c8e-ebb2-406c-9bc2-d556fd53fcbf/scratchpad/ref/*.jpg`
  and `…/scratchpad/contact.png`. Ruler-gridded crops at native size: `…/scratchpad/crops/*.png`
  (red lines every 10 pt). Which is which: 5762–5763 store header; 5764–5771 and 5779 the menu grid with the
  tabs (5779 shows the floating "View cart" pill and a tile whose round button shows "1"); 5772 and 5775 the
  item sheet's top (hero, title, price, description, the first group); 5776 option groups with Required tags
  and radios; 5773 and 5777 the stepper; 5780 the cart page (rows, stepper pill, Add items, icon rows,
  Subtotal, Go to checkout); 5782–5783 the checkout (header with back arrow, segmented control, icon rows,
  time-option cards, Order summary, Next); 5784 a payment sheet.
- The font comparison that chose Figtree: `…/scratchpad/fonts/words_compare.png`.

## Read first
- `docs/design.md` §11 (the intro), §11.1, §11.6 (the structure, kept), **§11.7 (this pass; read it twice)**,
  §11.2 `cart.ts` (`itemQuantity`), §11.3 (the font), §3 rows "Staff" and "Pickup code".
- Every file under `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/lib/` and
  `apps/web/test/cart.test.ts` (the red `itemQuantity` tests at the end).
- The last two briefs for what exists: `docs/handoffs/m6-web-design.md`, `docs/handoffs/m6-web-polish.md`.

## You own
`apps/web/src/app/**` (pages, `layout.tsx`, `globals.css`), `apps/web/src/components/**`, and in
`apps/web/src/lib/` only `cart.ts` (replace the throwing `itemQuantity` stub with the implementation; nothing else
in that file) and `tiles.ts` (the glyph sizes if you need to; the palette and the API stay, its tests must pass).
Nothing else: no test files, no configs, no `package.json`, no `next.config.ts`, no API, no core.

## You must not
- Change behaviour: the same API calls, texts from `src/lib/` (`statusView`, `errorText`, `chip`, `dayLabel`,
  `dayStatusText`, `formatCents`), storage keys, polling and refresh intervals, routes, the cart's rules, the
  sheet's stepper (1–20, `addLine` n times), the scroll-spy, Escape closing the sheet. The only addition: the
  tile's round button shows `itemQuantity(cart, item.id)` instead of the plus when it is above 0 (§11.7).
- Add dependencies. The font comes through `next/font/google` (built into Next): `Figtree` with weights
  `["400", "500", "700"]`, `subsets: ["latin"]`, `display: "swap"`, `variable: "--font-figtree"`, on `<html>`;
  in `globals.css` `@theme { --font-sans: var(--font-figtree), system-ui, sans-serif; … }` so Tailwind's `font-sans`
  (the default body font) is Figtree. `next build` downloads the files once; the machine has network.
- Use colours, sizes or radii other than §11.7's. Define §11.7's colours once as Tailwind theme tokens in
  `globals.css` (`@theme { --color-ink: #111111; --color-ink-2: #525252; … }`) and use them as utilities
  (`bg-ink`, `text-ink-3`, `border-line`, `bg-well`, `bg-tag`, `bg-green`, `text-green-text` …). No
  `neutral-*`, `green-700`, `red-50` and the like remain in the screens afterwards (grep for them). The six tile
  backgrounds in `tiles.ts` are the exception (§11.7 keeps them).
- Add images, dark mode, a monospace font, or anything from the reference's content. No `font-mono` remains.
- Commit, push, deploy, or touch `reference/`.

## Per screen (what §11.7 means on each; §11.6 for the structure)
- **Store page `/`:** cover 260 high (the gradient, mark and pattern stay), the round white cart button 40 with
  the badge at 12/12; the white card overlapping by 24 with radius-24 top corners, padding 20 16 0: the name
  24/28 700 tracking −0.01em, the info line 14/20 400 `ink` "Halal chicken • Pickup only • Berlin", the grey line
  14/20 400 `ink-3`, the soft green chip "Pay online, pick up on time", the two-cell bordered box (72 high,
  radius 12, 1 px `line`, divider): "Pickup only" / "order ahead", "Every 15 min" / "pickup slots". The compact
  header 56 high with the title 18/24 500. The tab bar exactly as §11.7 (44 high, 14/20 500, 16 padding, the 5 px
  `line` track with the `ink` segment under the active tab, 3 px white, the 4 px `line-2` band). Sections:
  padding-top 24, heading 20/24 700, margin-bottom 16; the grid gutter 8, row gap 20; the tile square with
  radius 12 and the glyph at text-6xl; the 36 round button 8 from the right and bottom edges showing the plus
  (20, stroke 2) or the quantity (16/20 500); name 16/20 500 (two lines), price 14/20 400, description 14/20 400
  `ink-3` (two lines), the Popular tag (20 high, radius 4, `green`, 12/16 500, padding 0 6) with margin-top 8.
  The floating pill 56 high `ink` with the 20 bag icon and "View cart • n" 18/24 500, shadow as §11.7, 20 above
  the bottom. The toast as §11.7.
- **Item sheet:** the hero 230 high (glyph text-8xl) with the round white X 44 at 8/8 (shadow as §11.7); body
  padding 16: title 24/28 700 (margin-top 16), price 20/24 500 (margin-top 8), description 14/20 400 `ink-3`
  (margin-top 12); a 4 px `line-2` band (full bleed); each group padding 16 0: heading 20/24 700 with the
  Required / Optional tag (24 high, radius 6, `tag`, 14/20 500) at the right, the hint 14/20 400 `ink-2`, rows
  72 high (name 16/20 400, the delta 14/20 400 `ink-2` under it when non-zero, the 18 radio or checkbox at the
  right as §11.7) with 1 px `line-2` hairlines; 4 px `line-2` bands between groups; the stepper section
  (padding 16; the pill 130 × 36 `well`, "−" in `mute` at quantity 1, the number 16/20 500, icons 20); the pinned
  bar (white, padding 12 16 + safe area, no border) with the 56 primary button "Add n to cart • total" (18/24 500;
  disabled `disabled`/`disabled-text`).
- **Checkout `/checkout`:** a 56 header with the X (to `/`) at the left and nothing else; then the title
  "Checkout" 24/28 700 (the reference's cart page puts a big left-aligned title under the X); the cart lines as
  rows (72 tile radius 12, name 16/20 500, price 14/20 400 `ink-3`, option summary 14/20 400 `ink-3` with " • "
  between groups, the 92 × 36 stepper pill with the trash icon at quantity 1); "Add items" as a 36 `well` pill
  right-aligned with a 16 plus icon; a 4 px `line-2` band; the icon rows (24 icon, title 16/20 500, subtitle
  14/20 400 `ink-2`, chevron 20 `chevron`, padding 16 0, 1 px `line` hairlines): **Pickup time** (the day chips
  36 `well`/`ink` and the slot cards 48 high with the 1 px `line` border, radius 8, chosen = 2 px `ink` border,
  disabled = `well` with `chevron` text and the hint 12/16 under the label, inline under the row), **Your name**
  (the 48 input inline), **Promo code** (input + Apply; the applied code as a 14/20 500 `green-text` line); a
  band; "Order summary" 20/24 700 and the rows as §11.7 (32 high, 16/20 400 `ink-2`; VAT 14/20 400 `ink-3`;
  discount `green-text`; Total 18/24 700 with margin-top 8); the payment row (card icon, "Pay by card with
  Stripe • test mode"); the error box above the pinned "Pay • total" button.
- **Status `/orders/[id]`:** the 56 header "Your order" 16/20 500; headline 24/28 700, body 14/20 400 `ink-3`;
  the progress line (4 high segments, gap 6, `ink`/`line`, labels 14/20 500 `ink`/`chevron`); the QR card
  (white, 1 px `line`, radius 12, padding 24, QR 224, the code 32/36 700 tracking 0.12em `tabular-nums`,
  "Show this at the counter" 14/20 400 `ink-3` for ready); detail rows (24 icon, 16/20 400, hairlines); a band;
  "Order summary" with the receipt lines (the quantity in a 20 × 20 `well` square radius 4, 12/16 500) and the
  summary rows; "Continue to payment" primary / "Back to the menu" secondary.
- **Staff `/staff`, `/staff/pickup`:** the 56 header with the back arrow and "Staff" / "Check in" 16/20 500;
  "Orders" 20/24 700 with the date input and Refresh as 36 `well` pills; slot cards and order rows as §11.7
  (codes 18/24 700 tracking 0.12em; status tags in the Required shape with §11.7's colours; small buttons 40
  high radius 8); the token form and the code form with 48 inputs and the 56 button; the check-in result with
  the 24/28 700 headline, the code 32/36 700, the detail card (1 px `line`, radius 12).
- **Frame:** `layout.tsx` sets the font class on `<html>`; body `bg-white text-ink font-sans antialiased`; the
  footer 12/16 400 `ink-3` with the Staff link 12/16 500 `ink`.

## Done means
- `pnpm test` (all packages; the `itemQuantity` tests now green, 225 + 4 = 229 web tests), `pnpm typecheck`,
  `pnpm check` (run `pnpm format` first), `pnpm --filter @slot-order/web build` green, and the OpenNext build
  (`pnpm --filter @slot-order/web exec opennextjs-cloudflare build`) produces `.open-next/worker.js`.
- `grep -rn "neutral-\|green-700\|red-50\|red-700\|font-mono\|orange-" apps/web/src` finds nothing (except the
  tile palette in `tiles.ts`).
- Render every screen at 390 × 844 with headless Chrome (`"/Applications/Google Chrome.app/Contents/MacOS/Google
  Chrome" --headless=new --screenshot=… --window-size=390,844 --force-device-scale-factor=2 <url>`), against
  `next dev -p 3001` (port 3000 is taken) and the local API (`supabase start` is running; `pnpm --filter
  @slot-order/api exec wrangler dev --var WEB_ORIGIN:http://localhost:3001`, which reads `apps/api/.dev.vars`;
  `apps/web/.env.local` points at `http://localhost:8787`). For the sheet, the status page and the staff pages,
  drive the page with a small Puppeteer-free approach: a page URL plus `localStorage` seeded through a `data:`
  bootstrap is not available headless, so render what can be reached by URL (`/`, `/checkout` after adding items
  through the UI is not reachable headless either) — therefore **use Chrome's remote debugging**
  (`--remote-debugging-port=9222`, drive it with a short Node script over the DevTools protocol using Node's
  built-in `WebSocket`; no new dependency) to click a tile, open the sheet, add items, open `/checkout`, and to
  visit `/orders/<id>` for an order you create through the API (`POST /orders` with a slot from `GET /slots`;
  the order is `held` with a Stripe test URL) and `/staff` with the dev `STAFF_TOKEN` from `apps/api/.dev.vars`
  set in `localStorage` (`slot-order.staff-token`). Save the shots under
  `/private/tmp/claude-501/-Users-antonsplavnik-Documents-Programming-Projects-slot-order/a3e11c8e-ebb2-406c-9bc2-d556fd53fcbf/scratchpad/shots3/`
  and put each beside its reference screen (the contact sheet) in your report. If the DevTools route costs more
  than an hour, render `/`, the sheet and `/staff` (token form) by URL and say so.
- Your report: the files changed; per screen two lines on what changed and one on how it compares to the
  reference; every place where §11.7 could not be followed (and what you did instead); the check results with
  the counts; the paths of the shots.
