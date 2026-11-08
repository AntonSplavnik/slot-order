# M6 brief: design pass 4, the item page (the contract, the motion plan, the red tests)

Anton's fourth review (2026-11-08), after PR #10: on the store page the tile's round "+" adds an item without
option groups to the cart at once; in the reference it **always opens the item's page**, and that page is where
the item is added. He wants ours to work like the reference: tapping the "+" or the picture opens a full-screen
item page whose content depends on the dish (its option groups, a stepper, add-on rows, the pinned Add button).
He also asked for **more animation** across the app, planned with the motion skills installed in Claude Code.

You prepare this pass; a second agent implements it from your brief. You write **three things**: the spec section
§11.9 in `docs/design.md`, the red tests with their throwing stubs, and the implementer brief
`docs/handoffs/m6-item-page-impl.md`. You do not implement the screens.

## Anton's addition (2026-11-08, while the prep ran)
**Drinks go straight into the cart; no item page, no extra details.** A drink (the Drinks section: `kind: item`,
`vatCategory: drink`) is added at once from its round "+" (quantity 1, no options, the toast, the circle shows
`itemQuantity`); tapping its tile does the same (a drink has one action, add; recorded as a decision Anton can
flip). Food and combos open the item page from both the "+" and the tile. One pure predicate decides,
`quickAdds(item)` in `menu.ts` (a drink without a required option group), shared by the grid and `upsellItems`,
with red tests and its §11.2 bullet. Sent to the prep agent by message; folded into §11.9, §11.1, the tests and
the implementer brief.

## Anton's second addition (2026-11-08): the drink tile after an add
A new screenshot, `reference/uber-eats-3/IMG_B0889EDB3B03-1.jpeg` (1284 × 2778, 3×, git-ignored), shows the Drinks
grid with one drink in the cart: its round "+" has become a white fully rounded **stepper pill** in the tile's
corner ("−", the quantity, "+"; the same shadow and offset as the round button, about 36 high). Rule for
quick-add items: quantity 0 → the round "+"; quantity > 0 → the pill in place, "−" removes one (the line goes at
1, the pill collapses back to the "+"), "+" adds one. Library: `removeOne(cart, itemId)` in `cart.ts` (the
no-options line of that item loses one; removed at 1; no such line → equal cart), stub + red tests + its §11.2
bullet. The change from "+" to pill is a motion candidate. Sent to the prep agent by message.

## Reference (look only; none of its content may enter the repo)
- The 17 new screenshots: `/Users/antonsplavnik/Documents/Programming/Projects/slot-order/reference/uber-eats-2/IMG_5785.PNG`
  … `IMG_5801.PNG` (1284 × 2778, a 3× screen of 428 × 926 pt: **CSS px = px ÷ 3**; git-ignored). Downscaled copies
  (700 px wide) for a quick look:
  `/private/tmp/claude-501/-Users-antonsplavnik-Documents-Programming-Projects-slot-order/7d2c079e-a8fe-460a-84eb-ab2807adf66a/scratchpad/ref2/*.jpg`.
  Measure on the originals (Python 3 with Pillow is installed; `sips` too). Which is which:
  - **5785** the item page's top: the hero photo full-bleed under the status bar, the round white X top-left and a
    round share button top-right, the title (two lines), the price, the description, small grey tags, a band, the
    first option group with its "Required" tag and hint, rows with a radio at the right and a "Product info" link,
    a second group ("Choose up to 1") with checkboxes, the pinned "Add 1 to cart • price" button.
  - **5786–5788** the same page scrolled: a **sticky compact header** (plain X at the left, the title in one line
    with an ellipsis, the share icon at the right) replaces the round buttons once the title has scrolled under
    it; more groups; a "Special Instructions" note field with a caption; a disabled "Allergy requests" row; the
    stepper pill at the left.
  - **5789–5790** further down: **"Add sides"** and **"Add appetizers"**: rows with a small square tile, the name,
    the price (a "Popular" tag on one) and a round "+" at the right; **"More to explore"**: a horizontal carousel
    of tiles; an **"Ingredients"** accordion row; the pinned button throughout.
  - **5791–5792** another dish's page: different groups (a required radio group, optional checkbox groups).
  - **5793–5795** the store grid (the Drinks section) with the round "+" on every tile and the "View cart • 1"
    pill: the "+" opens the page for drinks too.
  - **5796** the cart page; **5797** a "Complete your order" upsell page after "Go to checkout"; **5798–5800** the
    checkout; **5801** a payment sheet. Not this pass; name 5797 under §16 Later.
- The 23 earlier screenshots (`reference/uber-eats/`) and their measurements are already in §11.7; reuse its
  tokens, type scale and shapes. Do not re-measure what §11.7 has.
- **Content rule:** no restaurant name, dish, description, photo, address, price or text from the screenshots
  appears anywhere in the repo (spec, tests, briefs, comments). Describe the layout; our menu is Goldhahn's.

## Read first
- `CLAUDE.md`; `docs/plan.md` ("How the work is done", Status); `docs/handoffs/README.md`.
- `docs/design.md` §11 (intro), §11.1 (the `/` row), §11.2 (`menu.ts`, `options.ts`, `cart.ts`), **§11.6, §11.7
  (twice), §11.8**, §16.
- Every file under `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/lib/`; `apps/web/test/helpers.ts`,
  `apps/web/test/menu.test.ts`, `apps/web/test/options.test.ts` (the test style: seed fixture, `deepFreeze`).
- The last briefs: `docs/handoffs/m6-web-design3.md`, `docs/handoffs/m6-photos-impl.md` (format and tone).
- The seed menu: `supabase/seed.sql` (ten items; only Chicken Burger, Chicken Wings and Fries have option groups;
  combos may not have groups, core's schema forbids it; no item has a description).

## The skills (invoke them with the Skill tool, in this order, before writing)
1. `improve-animations` over `apps/web/src/**`: the audit of what moves today (the sheet's slide and fade, the
   toast's fade, the compact header's opacity, `press` on every pressable, the hover colours) and the prioritized
   plan of what to add. It is read-only on code; its plan goes into §11.9 and the implementer brief.
2. `animate` for each new motion you specify (should it move at all, purpose, properties, curve, duration,
   interruption, exit). Write each decision down as numbers.
3. `emil-design-eng`, `mobile-native`, `better-accessibility` for the item page itself (a full-screen modal page
   on a phone: focus, `inert`, scroll locking, safe areas, the sticky header, the hit areas, the names).
Limits the skills work within (§11.7's motion paragraph, kept): transforms and opacity only (colour transitions
allowed at 150 ms), nothing over 300 ms except a toast's hold, every entrance and exit under `motion-safe:` with a
plain fade or nothing under reduced motion, no `transition-all`, no animation on keyboard-driven state changes
that is not also on pointer ones, **no new dependencies** (CSS keyframes and Tailwind utilities; React state where
an exit needs it). Where a motion needs state (an exit animation keeps the element mounted until it ends), say
so and give the rule (a `closing` flag, `onAnimationEnd` with a timeout fallback, focus restored after).

## What you write

### 1. `docs/design.md` §11.9 "Design pass 4: the item page and motion (Anton's review, 2026-11-08)"
Insert it after §11.8 and before "## 12. Errors". Also change: §11.1's `/` row ("Tapping an item with option
groups opens a sheet … an item without groups is added at once" → every item opens its page; the page adds it),
and §16 (add the later items: 5797's upsell page, a note field on a line, "More to explore", an ingredients
accordion, share; remove nothing). Touch no other section.
§11.9 must settle, with numbers, in §11.7's voice (tokens, type styles by their utility names, CSS px):
- **Behaviour.** The tile's round button and the tile itself both open the item page for every item; nothing is
  quick-added from the grid. The button's accessible name is "Add <item>" (with the "n in cart." prefix when the
  cart holds it, as now). The page adds `quantity` of the item with the chosen options through the existing
  `add` (unchanged: `addLine` n times, the 30-line limit, the toast, the page closes). Items without groups show
  no group section. Everything else of the cart's rules stays.
- **The page.** Full-screen on phones (`inset-0`, no top gap, no rounded corners; at `sm:` and up the centred
  `max-w-md` panel with `max-h-[90dvh]` and radius 16 stays). A portal into `<body>`, `role="dialog"`,
  `aria-modal`, the focus management and `inert` of §11.7 unchanged; Escape and the backdrop close it; the browser
  back button is not wired (say so). Structure top to bottom, each with its measurements from the screenshots:
  the hero (`Tile` size `hero`, 230 high, as now) with the round white X (44) at 8/8; the **compact header** (56
  high, white, the X in a 44 hit area at the left, the title `text-body-strong` centred, one line with an ellipsis
  — the one place truncation is allowed because the full title sits below; give the opacity/translate transition
  and its trigger: an IntersectionObserver on the title, as the store page does); the title, price and description
  as §11.7 (no description for our items today: say the page shows a combo's components line through `describe`
  and nothing for an item without one); the option groups as §11.7 (no "Product info" links: we have none); the
  **stepper** section as §11.7 (keep the 130 pill); then **"Add a drink"**: the heading (`text-heading`, padding
  16 16 8?), rows measured from 5789 (the tile size and radius, the row height, the name and price styles, the
  round "+" 36 at the right, the hairlines), listing `upsellItems(menu, item)` (below), each row's "+" adding one
  of that drink to the cart at once (through `addLine`, the toast "Added <name>." at the top, the circle then
  showing the drink's `itemQuantity` as the grid does; a second tap adds another); no "More to explore", no
  "Ingredients", no note field, no share (§16). The pinned bar and button "Add n to cart • total" as §11.7.
- **Library.** `menu.ts` gains `upsellItems(menu: PublicMenu, item: MenuItem): MenuItem[]`: for an item that is
  not a drink (`kind: item` with `vatCategory: drink` is a drink), the Drinks section's items (active, in `sort`
  order, via `menuSections`) that can be added without a choice (no option group with `minChoices > 0`); for a
  drink, `[]`; never the item itself. `options.ts` gains `groupHint(group: OptionGroup): string` moved out of
  `OptionSheet.tsx`: `minChoices === maxChoices` → "Choose n"; `minChoices === 0` → "Choose up to n";
  else "Pick at least m, up to n". Pure, no I/O. Write their exact wording into §11.2 as well (one bullet each).
- **Motion.** The result of the skills, as a numbered list the implementer can build from: for each item the
  element, the trigger, the properties, duration, curve, the reduced-motion fallback, whether it needs state.
  Candidates to decide on (keep, change or drop each with a reason): the page's entrance (now 300 ms slide on
  `cubic-bezier(0.32, 0.72, 0, 1)`) and a **new exit** (slide down and fade the backdrop; the dialog stays
  mounted until the animation ends); the compact header's appearance; the tile's round button when it changes
  from "+" to a number or the number changes (a short scale pop); the floating cart pill's entrance when the
  first item is added and its count change; the toast's entrance and exit (one keyframe animation over its whole
  2500 ms life needs no state); the radio dot and checkbox check; the tab bar's active segment sliding between
  tabs (say what measuring it costs; drop it if it needs layout reads on every scroll); the checkout's slot card
  and day chip selection; the status page's progress segments filling and the QR card's appearance. Say which
  motions are in this pass and which are deferred, and why.
- **Decisions** paragraph: what was decided and why (the full-screen page over a route, the drinks as the one
  upsell list because it is data-driven, no seed change in this pass; the four later items).

### 2. Red tests and stubs
- `apps/web/src/lib/menu.ts`: add `upsellItems` as a throwing stub (`throw new Error("not implemented")`) with its
  JSDoc; `apps/web/src/lib/options.ts`: add `groupHint` likewise. Nothing else in `src/`.
- `apps/web/test/menu.test.ts`: append a `describe("upsellItems (§11.2, §11.9)")` block, at least six tests on the
  seed: a food item → the three drinks in sort order (`ayran`, `cola`, `water`); a combo → the same; a drink →
  `[]`; an inactive drink hidden (use `withInactiveItem` from the core fixture or build a menu); a drink with a
  required group excluded, one with an optional group kept (build the menu with `toPublic`); the result holds
  the menu's own item objects (`toBe` on an element); the input is not mutated (the fixtures are frozen already;
  say so in a comment rather than writing a no-op test).
- `apps/web/test/options.test.ts`: append `describe("groupHint (§11.2, §11.9)")`: the seed's Size (1/1) →
  "Choose 1", Sauce (0/2) → "Choose up to 2", Heat → "Choose 1", a built group 1/3 → "Pick at least 1, up to 3",
  a built group 2/2 → "Choose 2", 0/1 → "Choose up to 1". Build groups with the schema-valid shape (options
  count ≥ maxChoices).
- Run `pnpm --filter @slot-order/web test`: exactly your new tests fail, with the stub's error; `pnpm typecheck`
  and `pnpm check` pass (run `pnpm format` first). Report the counts.

### 3. `docs/handoffs/m6-item-page-impl.md` (the implementer's brief)
In the format of `m6-web-design3.md` and `m6-photos-impl.md`: the goal in three lines; "Read first" (§11.9,
§11.7, §11.2, the files); "You own" (`apps/web/src/app/page.tsx`, `apps/web/src/components/**`,
`apps/web/src/app/globals.css`, in `src/lib/` only the two stubs to replace; nothing else, no tests, no configs,
no `package.json`, no API, no core, no seed); "You must not" (behaviour beyond §11.9, dependencies, colours or
sizes outside §11.7/§11.9, anything from the reference's content, commits); the page section by section with
every number; the motion list verbatim from §11.9 with the Tailwind/CSS shape of each (keyframe names under
`@theme --animate-*`, class names); the skills the implementer invokes at the start (`emil-design-eng`,
`mobile-native`, `better-accessibility`: they refine, §11.9 decides); "Done means": `pnpm test` green with the
new tests, `pnpm typecheck`, `pnpm check`, `pnpm --filter @slot-order/web build`, the OpenNext build
(`pnpm --filter @slot-order/web exec opennextjs-cloudflare build` → `.open-next/worker.js`); the two greps of
`m6-web-design3.md` still clean (list them); renders at 390 × 844 over Chrome's DevTools protocol as pass 3 did
(the local stack: `supabase start` is up; the API `pnpm --filter @slot-order/api exec wrangler dev --var
WEB_ORIGIN:http://localhost:3001`; the web `next dev -p 3001` — port 3000 is taken; `apps/web/.env.local` points at
`http://localhost:8787`; headless Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`;
drive it with a short Node script over `--remote-debugging-port=9222` and Node's `WebSocket`, no dependency),
saved under
`/private/tmp/claude-501/-Users-antonsplavnik-Documents-Programming-Projects-slot-order/7d2c079e-a8fe-460a-84eb-ab2807adf66a/scratchpad/shots4/`:
the grid, the page for an item with groups, for one without, for a combo, the page scrolled with the compact
header, the "Add a drink" rows after one tap, the page at `sm:`; and the report format (files changed, per screen
what changed, every place §11.9 could not be followed, the check counts, the shot paths).

## You must not
- Implement the screens, change any file outside: `docs/design.md` (§11.1 row, §11.2 two bullets, §11.9, §16),
  `docs/handoffs/m6-item-page-impl.md` (new), the two stubs, the two test files.
- Add dependencies, touch configs, `package.json`, the API, core, the seed, `reference/`, CI.
- Commit, push, deploy.
- Put anything from the reference's content into any file.

## Report
The §11.9 text is in the spec (say the line range); the tests: files, count, how they fail; the brief's path; the
skills' main findings in ten lines (what the audit ranked first, what you dropped and why); the open questions
only Anton can answer, if any (the orchestrator decides the rest).
