# M6 brief: design pass 2, a delivery-app store layout (Anton's review)

Anton is not satisfied with the look after the first polish. The reference he chose is **Uber Eats' standardized
store layout** (every restaurant there gets the same skeleton; only photos, names and prices differ). You restyle
`apps/web` to that skeleton with our content, **coloured tiles instead of photos** (his decision), and without
changing what the screens do. Behaviour stays in `src/lib/` and in the existing data flow.

## Reference
`/private/tmp/claude-501/-Users-antonsplavnik-Documents-Programming-Projects-slot-order/8a33781c-a9d9-4293-9190-a248602e0082/scratchpad/ref/IMG_57*.png`
(23 phone screenshots, 462×1000). **Layout only.** They show a real restaurant's store on Uber Eats: no name, dish,
description, photo, address or phone number from them may appear anywhere in the repo, in code, comments, tests or
docs. Our restaurant is the made-up Goldhahn with the seed menu. The folder is git-ignored and stays so.

## Read first
- `docs/design.md` §11 (now with §11.6, this pass), §11.5, §3 rows "Staff" and "Pickup code".
- Every file under `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/lib/` (the library is called,
  not changed; the only new library file is `tiles.ts`, below).
- The last pass's brief `docs/handoffs/m6-web-polish.md` for what already exists (header, cards, bottom sheet).

## You own
`apps/web/src/app/**`, `apps/web/src/components/**`, the new `apps/web/src/lib/tiles.ts` with
`apps/web/test/tiles.test.ts`, `apps/web/src/app/globals.css`. Nothing else.

## You must not
- Change behaviour: the same API calls, texts from `src/lib/` (`statusView`, `errorText`, `chip`, `dayLabel`,
  `formatCents`), storage keys, polling and refresh intervals, routes. Allowed UI-level additions: a quantity
  stepper in the item sheet that calls `addLine` that many times (it merges, so the cart ends at that quantity),
  a scroll-spy for the sticky section tabs, a "show more" on long descriptions.
- Touch the other library files, their tests, configs, `package.json` (no new dependencies; no icon or font
  package; inline SVG icons you write, a dozen at most), `next.config.ts`.
- Add images, dark mode, or anything from the reference's content.
- Commit, push, deploy.

## The language (from the reference)
- **Surfaces:** white page, black text (`text-neutral-900`), grey secondary text (`text-neutral-500`), hairline
  separators (`border-neutral-200`), light grey wells for inputs and steppers (`bg-neutral-100`), rounded corners
  (`rounded-xl` on tiles and cards, `rounded-lg` on buttons, `rounded-full` on pills and round buttons).
- **Primary button:** black, white text, full width, 52 px high, `rounded-lg`, label with a dot separator:
  "Add 1 to cart · 9,40 €", "Go to checkout", "Pay · 22,30 €". Secondary: light grey well, black text. Round
  white "+" buttons with a soft shadow on tiles. A floating black pill at the bottom centre: cart icon + "View
  cart · 3" (ours links to `/checkout`), shown when the cart has items.
- **Type:** the system font; store name `text-2xl font-bold`; section headings `text-xl font-bold`; item names
  `font-semibold`; prices normal weight; secondary lines `text-sm text-neutral-500`.
- **Tags:** green `bg-green-700 text-white text-xs font-semibold rounded px-1.5 py-0.5` for "Popular" (ours: the
  combos, the two "Menus", get it), light grey `bg-neutral-100 text-neutral-700` for "Required" / "Optional"
  and the option-count hint; a green text line for a positive note.
- **Tiles instead of photos** (`src/lib/tiles.ts`, pure, tested): `tileFor(item: MenuItem, index: number): { bg:
  string; glyph: string }`. `bg` is one of six Tailwind background classes in a warm palette, cycling by `index`
  (e.g. `bg-amber-100`, `bg-orange-100`, `bg-rose-100`, `bg-lime-100`, `bg-sky-100`, `bg-violet-100`); `glyph`
  is a large emoji by item id from a small map (chicken 🍗, burger 🍔, wings 🍗 or 🔥, fries 🍟, coleslaw 🥗,
  ayran 🥛, cola 🥤, water 💧, menus 🍱), with the item name's first letter as the fallback for unknown ids.
  Tests: the palette cycles (index 0 and 6 give the same class, 0 and 1 differ), every seed item gets a glyph,
  an unknown id gets its initial, the output is deterministic. Tiles are 4:3, `rounded-xl`, the glyph centred
  at `text-5xl` (grid) or `text-7xl` (hero of the sheet).

## Per screen
- **Store page `/`:** a cover band at the top (full-width, 180 px, a warm gradient with the Goldhahn mark and a
  faint pattern of the glyphs; no text in it) with round white icon buttons overlaid at the top right (a search
  icon that focuses a search field is optional; a cart icon with the badge). A white card with rounded top
  corners overlapping the band: **Goldhahn** `text-2xl font-bold`, an info line "Halal chicken · Pickup only ·
  Berlin", "Pickup slots every 15 min, pay online, show the QR code" in grey, a row of two grey info tiles
  ("Pickup" / "order ahead" and "Slots" / "every 15 min"). Then a sticky bar (sticks under a compact header that
  appears when the band scrolls away: a back-less title "Goldhahn" centred): the section tabs **Food · Drinks ·
  Menus** scrolling horizontally, active one underlined in black, scroll-spy by `IntersectionObserver`, tapping
  scrolls to the section. Each section: heading, then a **2-column grid** of item cards: the tile with the round
  "+" at its bottom right (tapping "+" adds an item without groups at once, opens the sheet otherwise), the
  name (2 lines max), the price, the description in grey (2 lines, truncated with `line-clamp-2`), the green
  "Popular" tag on combos. The floating "View cart · n" pill above the footer. An "Added …" toast is fine.
- **Item sheet:** full-height on phones (a modal that slides up, `rounded-t-2xl`, backdrop), a hero tile across
  the top with the round X at the top left, then: name `text-2xl font-bold`, price `text-lg`, the description
  (a combo lists its components as the description), option groups each with a bold heading, a "Required" or
  "Optional" grey tag at the right and a grey subtitle built from the group ("Choose 1", "Choose up to 2",
  "Pick at least 1"), rows with the option name left, the delta ("+1,50 €") under it in grey when non-zero, a
  radio or checkbox circle at the right, hairline separators; a quantity stepper (`bg-neutral-100 rounded-full`,
  "− 1 +") above the pinned black button "Add 1 to cart · 9,40 €" (the total for the quantity). **Add** disabled
  until `selectionValid`.
- **Checkout `/checkout`** (the cart and the checkout in one page, as now, in Uber's cart-page style): a header
  with a back arrow to `/` and "Checkout" centred; the lines as rows: a small tile (64 px) left, the name, the
  line price right, the option summary in grey under the name ("Size: large · Sauce: garlic"), a stepper pill
  (`bg-neutral-100`, a trash icon instead of "−" at quantity 1); "+ Add items" pill linking to `/`. Then rows
  with an icon, a label, a chevron: **Pickup time** (clock icon; opening the day pills and the slot grid inline
  below it, the chosen slot shown on the row like "Mon 9 Nov · 12:30"), **Your name** (person icon; the input
  inline), **Promo code** (tag icon; the input and Apply inline, the applied code as a green line). Then
  **Order summary**: Subtotal, Discount (when any), the VAT lines in grey, **Total** bold. A payment row with a
  card icon: "Pay by card with Stripe · test mode". The pinned black button **Pay · 22,30 €** with the error
  text above it.
- **Status `/orders/[id]`** (no reference screen; same language): a header with "Your order" centred; a big
  headline from `statusView` (`text-2xl font-bold`) and the body in grey; a three-step progress line
  (Paid → Ready → Picked up, the reached steps black, the rest grey; held/expired/cancelled show the bar grey
  with the status text instead); for paid and ready a white card with a hairline border: the QR centred, the
  code in `font-mono text-3xl tracking-widest`, "Show this at the counter" for ready; detail rows with icons
  (clock: "Pickup at 12:30", person: the name); the order summary rows and the receipt lines; the "Back to the
  menu" secondary button for the terminal states, "Continue to payment" primary for held.
- **Staff `/staff` and `/staff/pickup`:** the same language (black primaries, grey wells, green tags for ready,
  `font-mono` codes), structure as it is now.
- **Frame:** no orange top bar any more; the compact header per page as described; the footer with the made-up
  restaurant / Stripe test mode note and the Staff link, in grey.

## Done means
- `pnpm test`, `pnpm typecheck`, `pnpm check` (run `pnpm format`), `pnpm --filter @slot-order/web build` green,
  and the OpenNext build (`pnpm --filter @slot-order/web exec opennextjs-cloudflare build`) produces the worker.
- Render every screen at 390×844 against the local API (as the last pass did with headless Chrome; the script is
  at `/private/tmp/claude-501/-Users-antonsplavnik-Documents-Programming-Projects-slot-order/8a33781c-a9d9-4293-9190-a248602e0082/scratchpad/shots.mjs`,
  which you may reuse and adapt) and save the screenshots next to it under `shots2/`; stub the order and staff
  answers as before.
- Your report: the files changed, two lines per screen, any behaviour you added at the UI level (the stepper,
  the scroll-spy) and anything you left out, and the check results.
