# M6 brief: the UI polish pass (Anton's review of PR #7)

Anton ran the whole flow on his phone: it works. His one correction: the screens look bare. You restyle the five
screens of `apps/web` so they look like a small, cared-for restaurant app, **without changing what they do**.

## Read first
- `docs/design.md` §11.1 (the screens and their rules), §11.5 (decisions already taken: money format, texts, the
  staff flow), §3 rows "Staff" and "Pickup code".
- Every file under `apps/web/src/app/` and `apps/web/src/components/`, `apps/web/src/app/globals.css`.
- The library under `apps/web/src/lib/` is **not** yours: the screens keep calling it as they do.

## You own
`apps/web/src/app/**` (pages, `layout.tsx`, `globals.css`) and `apps/web/src/components/**`. Nothing else.

## You must not
- Change behaviour: the same API calls, the same texts from `src/lib/` (`statusView`, `errorText`, `chip`,
  `dayLabel`, `formatCents`), the same storage keys, the same polling and refresh intervals, the same routes.
- Touch `src/lib/`, the tests, configs, `package.json` (no new dependencies: Tailwind 4 utilities only; no icon
  package, no component library; inline SVG icons you write yourself are fine, a handful at most), `next.config.ts`.
- Add images, a dark mode, animations beyond simple transitions, or anything that needs JavaScript for looks alone.
- Commit, push, deploy.

## The look
- Mobile-first, one column, `max-w-md mx-auto`, comfortable spacing (`px-4`, `py-3` rows, `gap-3`), rounded
  cards (`rounded-2xl`), soft borders (`border-stone-200`), a warm neutral background (`bg-stone-50`), dark text
  (`text-stone-900`), one accent: Tailwind's `orange-600` (hover `orange-700`, soft `orange-50`), already used.
- A sticky top bar with the name **Goldhahn**, a subtitle "Order ahead, pick up on time", and on the menu page a
  cart badge (item count) that links to `/checkout`. A small footer with the "made-up restaurant, Stripe test
  mode" note and the Staff link.
- Buttons: a primary (`bg-orange-600 text-white rounded-xl px-4 py-3 font-medium`, full width where it is the one
  action, `disabled:opacity-50`) and a secondary (`border border-stone-300 bg-white`); pressed/focus states
  (`active:`, `focus-visible:ring-2 ring-orange-600 ring-offset-2`). Tap targets at least 44 px high.
- Typography: the system font stack (no web font), `text-base` body, `text-lg font-semibold` section headings,
  `tabular-nums` for prices, the pickup code in `font-mono text-3xl tracking-widest`.

## Per screen
- **Menu `/`:** section headings (Food, Drinks, Menus) with a thin rule; each item a card row: name, the
  description when there is one (`text-sm text-stone-600`), the price right-aligned, a small "Options" hint for
  items with groups, a round "+" button; a combo lists its components in small text. The cart bar sticks to the
  bottom: "3 items · 27,50 €" and a **Go to checkout** button.
- **Option sheet:** a bottom sheet (fixed, `rounded-t-2xl`, a dim backdrop that closes it, a handle), the item's
  name and price at the top, each group with its name and "choose 1" / "up to 2" (from `minChoices`/
  `maxChoices`), rows with a radio or checkbox control drawn with Tailwind (`accent-orange-600` on the native input
  is fine), the delta ("+1,50 €") right-aligned, the **Add — 9,40 €** button with the unit price.
- **Checkout `/checkout`:** three cards in order: the lines (name, options in small text, a stepper "− 2 +", the
  line total, a remove link), the name field (a labelled input with a focus ring), the pickup time (the day strip
  as horizontal pills with `dayLabel` and the status word under it, scrollable; the chips as a wrapping grid of
  pills, disabled ones muted with the hint under the grid or as `title`), the promo code (input + Apply, the
  applied code shown as a small tag with Remove), the receipt (lines, discount, VAT lines in `text-sm
  text-stone-600`, the total bold), then the full-width **Pay 27,50 €** button and the inline error above it.
- **Status `/orders/[id]`:** one card whose tone colours the top band (`waiting` stone, `good` orange, `done`
  stone, `bad` red-50/red-700): the title large, the body below; for paid/ready the QR centred in a white box
  with padding, the code under it in large monospace letters, "Show this at the counter", the slot label with a
  clock icon and the name; the receipt in a second card. The "Back to the menu" link as a secondary button.
- **Staff `/staff`:** a compact header row with the date input and a "Refresh" secondary button; one card per slot
  with "12:30 · 3/20" and the orders as rows: the code in monospace, the name, the lines in small text, a status
  tag (coloured: paid orange, ready green-700/green-50, picked up stone), and the **Ready** / **Picked up**
  buttons as small primaries. Empty slots collapsed to one line. The token form centred, with a short
  explanation.
- **Check-in `/staff/pickup`:** a single centred card: a big tick and "Picked up ✓" in green for success, the
  order's code, name, lines and slot; a red card with the error text and a **Try again** button otherwise; the
  manual code form when there is no code.
- Loading states: a short "Loading…" line in `text-stone-500`; no spinners needed.

## Done means
- `pnpm test`, `pnpm typecheck`, `pnpm check` (run `pnpm format`), `pnpm --filter @slot-order/web build` green, and
  `pnpm --filter @slot-order/web exec opennextjs-cloudflare build` still produces the worker.
- Run `next dev` against the local API (port 3001 if 3000 is taken, as before) and read the rendered HTML of each
  page (or view it in a browser if one is available) to check nothing broke.
- Your report: the files changed, what each screen looks like now in two lines, any place where the look needed a
  small behaviour change you did **not** make (list it instead), and the check results.
