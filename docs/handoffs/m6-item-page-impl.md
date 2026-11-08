# M6 brief: design pass 4, the item page and motion (the implementation)

Anton's fourth review: food and combos never go into the cart from the grid; the tile and its round "+" open a
**full-screen item page**, and the page adds the item. Drinks are the exception: they go into the cart at once,
and once in the cart their round button becomes a "−" / count / "+" pill. Plus twelve motions across the app.
**`docs/design.md` §11.9 is the contract** (every number below comes from it; where this brief and §11.9 differ,
§11.9 wins and you say so in the report). The library tests exist and are red; make them green without touching
them.

## Reference
- Layout only; **no name, dish, description, photo, price or text from the screenshots may appear anywhere in the
  repo** (code, comments, tests, docs, commit messages): `reference/uber-eats-2/IMG_5785.PNG` … `IMG_5801.PNG` and
  `reference/uber-eats-3/IMG_B0889EDB3B03-1.jpeg` (1284 × 2778, 3×: CSS px = px ÷ 3; git-ignored). 5785–5792 the
  item page (top, scrolled with the compact header, the rows card), 5793–5795 the store grid, uber-eats-3 the
  drink pill. 5796–5801 are not this pass.

## Read first
- `docs/design.md` **§11.9 (twice)**, §11.7 (tokens, type styles, shapes, the motion paragraph and the
  design-skill review), §11.2 (`cart.ts` `removeOne`, `menu.ts` `quickAdds` and `upsellItems`, `options.ts`
  `groupHint`), §11.1 (the `/` row), §11.6 and §11.8 for what exists, §16 for what is deliberately left out.
- Every file under `apps/web/src/app/`, `apps/web/src/components/`, `apps/web/src/lib/`; the red tests at the end of
  `apps/web/test/menu.test.ts`, `apps/web/test/options.test.ts`, `apps/web/test/cart.test.ts`.
- The last two briefs for the format and what exists: `docs/handoffs/m6-web-design3.md`,
  `docs/handoffs/m6-photos-impl.md`.

## At the start: the skills
Invoke `emil-design-eng`, `mobile-native` and `better-accessibility` (the Skill tool). They refine; §11.9 decides.
Do not add behaviour they suggest beyond §11.9 (no validate-on-submit, no back-button wiring, no drag).

## You own
- `apps/web/src/app/page.tsx`, `apps/web/src/components/**` (rename `OptionSheet.tsx` to `ItemPage.tsx`; new
  small components are fine), `apps/web/src/app/globals.css`; the motion items that touch them also allow
  `apps/web/src/app/checkout/page.tsx` (M10 only through `press`; nothing else there) and
  `apps/web/src/app/orders/[id]/page.tsx` (M11, M12 only).
- In `apps/web/src/lib/` only the four throwing stubs, replaced by their implementations: `removeOne` in
  `cart.ts`, `quickAdds` and `upsellItems` in `menu.ts`, `groupHint` in `options.ts` (and delete the private
  `groupHint` in the old sheet). Nothing else in those files.
- Nothing else: no tests, no configs, no `package.json`, no API, no core, no seed, no `reference/`.

## You must not
- Add behaviour beyond §11.9, or change what §11.9 keeps: the cart's rules (`addLine` n times, the 30-line limit,
  the 1–20 stepper), the texts from `src/lib/`, the scroll-spy, the checkout, the status page's polling.
- Add dependencies (no Motion, no Radix, no `next/image`). CSS transitions, `@starting-style`, keyframes, React
  state.
- Use colours, sizes or radii outside §11.7 and §11.9. Anything from the reference's content. Commit, push,
  deploy.

## The library (the red tests are the truth)
- `quickAdds(item)`: `item.kind === "item" && item.vatCategory === "drink" && !item.optionGroups.some((g) =>
  g.minChoices > 0)`. 11 tests.
- `upsellItems(menu, item)`: `[]` when `item` is a drink (`kind: item`, `vatCategory: drink`, groups or not);
  else the `drinks` section of `menuSections(menu)` filtered by `quickAdds` and without `item`; the menu's own
  objects (a test uses `toBe`). 9 tests.
- `groupHint(group)`: min = max → `Choose ${max}`; min 0 → `Choose up to ${max}`; else `Pick at least ${min}, up to
  ${max}`. Moved out of the sheet, import it there. 8 tests.
- `removeOne(cart, itemId)`: the first line with that `itemId` and `optionIds.length === 0`; quantity − 1, or the
  line removed at 1; none → an equal cart; the promo code kept; a new object, the frozen input untouched. 9 tests.

## The store page `/`
- `const quick = quickAdds(item)` per item. **Quick-add items:** the tile button and the round "+" call
  `add(item, [], 1)` (toast "Added <name>."). With `itemQuantity > 0` the round button is replaced by the **pill**:
  white, `rounded-full`, `h-10`, `px-1`, `inline-flex items-center`, `shadow-[0_1px_6px_rgba(0,0,0,0.18)]`,
  `absolute right-2 bottom-2` like the round button; a 36 × 36 "−" button (`MinusIcon size-4`), the number
  (`text-label tabular-nums min-w-4 text-center`, `aria-hidden`), a 36 × 36 "+" button (`PlusIcon size-4`,
  disabled at 20 with `disabled:text-mute`). About 96 wide with one digit. "−" → `setCart(removeOne(cart, id))`
  and the toast "Removed <name>."; "+" → `add(item, [], 1)`. At 20 the tile tap adds nothing and the toast says
  "You can add up to 20." **Other items:** the tile and the round button open the item page; the round button
  keeps §11.7's look (plus, or the count in `text-body-strong`).
- The round button's plus icon is `size-4` everywhere (§11.9 replaces §11.7's 20).
- Names: every tile button gets `tabIndex={-1}`; a quick-add tile adds `<span className="sr-only">, add one</span>`
  after its text. Round button of a page item: "Add <name>" with the "<n> in cart. " prefix as now and
  `aria-haspopup="dialog"`; of a quick-add item: "Add <name>". The pill: `role="group"`,
  `aria-label="<name>, <n> in cart"`, buttons "Remove one <name>" / "Add one <name>".
- Focus when the controls swap: before a change from round "+" to pill (or back), note whether
  `document.activeElement` is inside that item's control; after the render, focus the pill's "+" (or the round
  "+"). Otherwise leave focus alone.
- The toast: `notice` gains its placement, fixed when raised: `"top"` (`top-4`) when the item page stays open
  (a row's "+"), else `"bottom"` (`bottom-24` with the cart pill, `bottom-6` without). The visible toast is
  `aria-hidden`; its text also goes into one always-mounted, visually hidden `role="status"` region portalled into
  `<body>` with `data-live-region`, rendered empty on mount. Clear it when the toast ends.
- The cart pill stays mounted while the item page is open (remove the `sheet === null` condition).
- The compact header: drop `invisible` (it cuts the fade-out), keep `pointer-events-none` and `aria-hidden` when
  hidden (M3).

## The item page (`ItemPage`)
- The dialog as today (portal, `role="dialog"`, `aria-modal`, `aria-labelledby`, focus to the close button on
  open, `inert` on every other body child **except `[data-live-region]`**, `overflow: hidden` on body, focus back
  to the opener after unmount, removing `inert` first). Escape, the X, the backdrop and "Add n to cart" all start
  the exit (M2) instead of unmounting. Props as today plus what the rows need (the menu or the upsell list, the
  cart's `itemQuantity`, a callback that adds one drink with the toast at the top).
- Phone: `fixed inset-0`, no rounded corners, white, `flex flex-col`. `sm:` and up: the centred `max-w-md` panel,
  `max-h-[90dvh]`, `rounded-2xl`, over `bg-black/40`.
- The scroller: `flex-1 overflow-y-auto overscroll-contain scroll-pt-14`.
- **Hero:** `Tile` size `hero` (230 high, full bleed).
- **Close button (one):** `absolute left-2 top-[calc(6px+env(safe-area-inset-top,0px))] z-20 size-11`, "Close
  item", `CloseIcon size-6`; behind the icon an `aria-hidden` white circle `absolute inset-0 rounded-full bg-white
  shadow-[0_1px_6px_rgba(0,0,0,0.18)]` whose opacity goes 1 → 0 when compact (M3). Outside the scroller, so it
  stays put while the hero scrolls away. Press feedback as `press`; focus ring as `focusRing`.
- **Compact header:** `absolute inset-x-0 top-0 z-10 bg-white pt-[env(safe-area-inset-top,0px)]
  shadow-[0_1px_6px_rgba(0,0,0,0.3)]`, the 56 high row with the title `text-label-lg truncate text-center` in a box
  from 60 to width − 60 (`px-[60px]`), `aria-hidden="true"`, `pointer-events-none` (the close button above it does
  the work). Opacity 0 ↔ 1 (M3). Trigger: an `IntersectionObserver` on the title `<h2>`, `root` = the scroller,
  `rootMargin: "-56px 0px 0px 0px"`; compact = `!entry.isIntersecting && entry.boundingClientRect.top <
  (entry.rootBounds?.top ?? 0) + 56`.
- **Title block:** `px-4 pb-4`: the title `mt-4 text-title`, the price `mt-2 text-price-lg tabular-nums`, then the
  `describe` line `mt-3 text-body-sm text-ink-3` when there is one (a combo's components; nothing for the others).
- **Groups:** as today (band `h-1 bg-line-2`, `fieldset px-4 py-4`, the heading `text-heading` with the
  `greyTag`, the hint `groupHint(group)` `mt-0.5 text-body-sm text-ink-2`, rows `min-h-18` with `divide-line-2`),
  radio and checkbox per M8. No section without groups.
- **Stepper:** band, then `p-4` and the 130 × 36 `well` pill as today. When the drinks card follows, this section
  is white with `rounded-b-[20px]` over the `well` area.
- **"Add a drink"** when `upsellItems(menu, item).length > 0`: a `bg-well` area with 20 above and below
  (`py-5`), the stepper section's rounded bottom over its top; inside, `rounded-[20px] bg-white`: the heading
  `p-4 text-heading` "Add a drink"; a `<ul>` with `pl-4`; each `<li>` `flex min-h-20 items-center gap-4 py-4 pr-4`
  with `border-b border-line-2` except the last: `Tile` size `row` (new: `size-12 shrink-0 rounded-lg`, 48 × 48,
  radius 8, the photo with `object-cover`, the fallback glyph `text-3xl`), then `min-w-0 flex-1` with the name `line-clamp-2 text-body-strong` over the
  price `text-body-sm text-ink tabular-nums`, then **the same control as the grid's quick-add items**: the round button `size-9 ${roundButton}` with
  `PlusIcon size-4` (name "Add <name>") while the drink's `itemQuantity` is 0, else the drink pill (M5 between
  them, M4 on the number). "+" → add one with the toast at the top (the page stays open); "−" → `removeOne`
  with the toast "Removed <name>." at the top; the "+" disabled at 20. Build the control once (e.g. a
  `QuickAddControl` component taking the item, its quantity, `onAdd`, `onRemove` and the toast placement) and
  use it on the grid and in the rows.
- **Pinned bar:** `border-t-2 border-line-2 bg-white px-4 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]`,
  the `primaryButton w-full` "Add n to cart • total" as today.
- Nothing else from the reference (no share, no "More to explore", no ingredients, no note, no allergy row).

## Motion (§11.9's list; the Tailwind / CSS shape of each)
In `globals.css` `@theme` add the curves and keyframes (names fixed so reviews can grep them):
```css
--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--animate-toast: toast 2500ms var(--ease-out-strong) both;          /* = NOTICE_MS in page.tsx */
--animate-toast-top: toast-top 2500ms var(--ease-out-strong) both;
--animate-toast-fade: toast-fade 2500ms var(--ease-out-strong) both;
--animate-count-tick: count-tick 150ms var(--ease-out-strong);
@keyframes toast { 0% { opacity: 0; transform: translateY(8px) } 8%, 92% { opacity: 1; transform: none }
  100% { opacity: 0; transform: translateY(8px) } }
@keyframes toast-top { /* the same with translateY(-8px) */ }
@keyframes toast-fade { 0% { opacity: 0 } 8%, 92% { opacity: 1 } 100% { opacity: 0 } }
@keyframes count-tick { from { opacity: 0.5; transform: scale(0.8) } to { opacity: 1; transform: none } }
```
Keyframes animate `transform`; Tailwind 4's `translate-*` / `scale-*` set the separate `translate` / `scale`
properties, so they compose (keep `-translate-x-1/2` on the toast and the cart pill). A transition that carries
Tailwind's translate or scale lists `translate`/`scale`. `starting:` is Tailwind 4's `@starting-style` variant;
put entrances under `motion-safe:` and give `motion-reduce:` the fade. Check the compiled CSS once (the variant
order `sm:motion-safe:starting:` must produce `@media … { @media … { @starting-style { … } } }`).
1. **M1 entrance.** Panel: `transition-[translate,scale,opacity] duration-300 ease-drawer
   motion-safe:starting:translate-y-full motion-reduce:starting:opacity-0 motion-reduce:duration-200`; at `sm:`
   `sm:duration-250 sm:ease-out-strong sm:motion-safe:starting:translate-y-0 sm:motion-safe:starting:scale-96
   sm:starting:opacity-0`. Backdrop: `transition-opacity duration-300 ease-out-strong starting:opacity-0`.
2. **M2 exit.** `const [closing, setClosing] = useState(false)`; `close()` sets it (once). While closing: the
   root `pointer-events-none`, Escape ignored; panel `translate-y-full duration-200` (phone), `sm:translate-y-0
   sm:scale-96 sm:opacity-0 sm:duration-150`, reduced `motion-reduce:translate-y-0 motion-reduce:opacity-0
   motion-reduce:duration-150`; backdrop `opacity-0 duration-200`. `onTransitionEnd` on the panel with
   `event.target === event.currentTarget` and `propertyName` in `translate`, `scale`, `opacity` → `onClosed()`;
   a `setTimeout(onClosed, 300)` fallback, cleared on unmount; `onClosed` runs once. "Add n to cart" calls
   `onAdd` first (cart, toast, pill update at once), then `close()`.
3. **M3 crossfade.** Header and the close button's circle: `transition-opacity duration-150 ease-out-strong`,
   `opacity-0`/`opacity-100` by `compact`. Same on the store page's compact header.
4. **M4 count tick.** A small `Count` component: `const initial = useRef(value)`; render `<span key={value}
   className={value !== initial.current ? "motion-safe:animate-count-tick" : ""}>`. Use it in the grid's round
   button (plus ↔ number: key the plus as `0`), the pill's number, the cart pill's count, the cover badge, the
   rows' round button.
5. **M5 round ↔ pill.** Pill: `origin-right transition-[scale,opacity] duration-150 ease-out-strong
   starting:opacity-0 motion-safe:starting:scale-90`; the round button that comes back: the same with
   `origin-center`, and its transition list also carries `transform, translate` for `press`.
6. **M6 cart pill.** `transition-[transform,translate,scale,opacity] duration-250 ease-out-strong
   starting:opacity-0 motion-safe:starting:[transform:translateY(16px)]` (press keeps `scale`; check that the
   press still uses 150 ms: put the press's duration on `active:` if the shared duration makes it feel slow, and
   say what you did).
7. **M7 toast.** `motion-safe:animate-toast` (or `-toast-top`) and `motion-reduce:animate-toast-fade`; drop
   `animate-fade-in` there. Unmount at `NOTICE_MS` = 2500 as now.
8. **M8 radio/checkbox.** Radio ring `transition-colors duration-150 ease-out-strong`; the dot always rendered,
   `transition-[scale,opacity] duration-150 ease-out-strong`, `scale-50 opacity-0` / `scale-100 opacity-100`,
   `motion-reduce:scale-100`. Checkbox: `transition-colors` on the box, the check like the dot.
9. **M9 tab bar.** Remove the per-tab segment spans; one `absolute bottom-0 left-0 h-[5px] w-[100px] origin-left
   bg-ink` bar inside the scrolling tab row, `style={{ transform: \`translateX(${left}px) scaleX(${width /
   100})\` }}`, `transition-transform duration-250 ease-in-out-strong motion-reduce:transition-none` once `ready`.
   Measure `offsetLeft`/`offsetWidth` of the active button in a `useLayoutEffect` on `active` and in a
   `ResizeObserver` on the row; never in a scroll handler. Labels `transition-colors duration-150`.
10. **M10 colours.** `press` in `ui.ts` = `transition-[transform,translate,scale,color,background-color,
    border-color,box-shadow] duration-150 ease-out not-disabled:active:scale-[0.97]`.
11. **M11 progress.** Each segment: the `line` track with an inner `absolute inset-0 origin-left rounded-full
    bg-ink` fill when reached, `transition-[scale] duration-300 ease-out-strong motion-safe:starting:scale-x-0`,
    `delay-80` for the second, `delay-160` for the third (first render only; later fills without delay),
    `motion-reduce:transition-none`.
12. **M12 QR.** The SVG box: `transition-[scale,opacity] duration-250 ease-out-strong starting:opacity-0
    motion-safe:starting:scale-97`.
Remove `--animate-sheet-up` if nothing uses it any more; keep `--animate-fade-in` only if something still does.

## Done means
- `pnpm test` (all packages; the 37 new web tests green: 238 + 37 = 275 web tests), `pnpm typecheck`, `pnpm check`
  (run `pnpm format` first), `pnpm --filter @slot-order/web build`, and the OpenNext build (`pnpm --filter
  @slot-order/web exec opennextjs-cloudflare build`) produces `.open-next/worker.js`.
- The greps of `m6-web-design3.md`, still clean:
  `grep -rn "neutral-\|green-700\|red-50\|red-700\|font-mono\|orange-\|truncate\|transition-all\|leading-tight\|leading-snug\|tracking-tight\|text-\[1" apps/web/src`
  finds only the tile palette in `tiles.ts` and **exactly one** `truncate` (the item page's compact header title);
  `grep -rn "text-2xl\|text-xl\|text-lg\|text-sm\|text-xs\|text-base" apps/web/src` finds nothing. Also
  `grep -rnE "ease-in([^-]|$)|scale-0([^.0-9]|$)" apps/web/src` finds nothing (`scale-x-0` in M11 is the one start from 0).
- Renders at 390 × 844 (device scale 2) over Chrome's DevTools protocol, as pass 3 did. The local stack:
  `supabase start` is up; the API `pnpm --filter @slot-order/api exec wrangler dev --var
  WEB_ORIGIN:http://localhost:3001`; the web `next dev -p 3001` (port 3000 is taken); `apps/web/.env.local` points
  at `http://localhost:8787`; headless Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  with `--remote-debugging-port=9222`, driven by a short Node script over Node's built-in `WebSocket` (no
  dependency). Save under
  `/private/tmp/claude-501/-Users-antonsplavnik-Documents-Programming-Projects-slot-order/7d2c079e-a8fe-460a-84eb-ab2807adf66a/scratchpad/shots4/`:
  the grid; the drinks with one drink at 2 (the pill) and the others with the round "+"; the page for an item with
  groups (Chicken Burger), for one without (Coleslaw), for a combo (Burger Menu); the page scrolled with the
  compact header; the "Add a drink" rows after one tap (the toast at the top, the pill in the row); the page
  at `sm:` (a 768 × 1024 window). Stop the servers afterwards.
- Report: the files changed; per screen what changed (two lines each); every place §11.9 could not be followed
  and what you did instead; the check results with the counts; the shot paths. You never commit, push or deploy.
