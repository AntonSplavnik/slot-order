// The look shared by the screens (docs/design.md §11.6 structure, §11.7 tokens: white surfaces, `ink` primaries,
// `well` greys, `line` hairlines, the named type scale). Class strings only: no behaviour lives here.

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

/** Press feedback on every pressable (§11.7 Motion): a 150 ms ease-out scale to 0.97, never on a disabled one; the
 * same 150 ms carries hover and state colours (§11.9 M10), so they change instead of jumping. */
export const press =
  "transition-[transform,translate,scale,color,background-color,border-color,box-shadow] duration-150 ease-out not-disabled:active:scale-[0.97]";

const button = `inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed ${press} ${focus}`;

/** The one action of a screen: 56 high, radius 8, `ink`, the label 18/24 500. */
export const primaryButton = `${button} h-14 rounded-lg px-5 bg-ink text-label-lg text-white disabled:bg-disabled disabled:text-disabled-text`;

/** A second, quieter action: the primary's shape in `well`. */
export const secondaryButton = `${button} h-14 rounded-lg px-5 bg-well text-label-lg text-ink not-disabled:hover:bg-tag disabled:text-disabled-text`;

/** A small primary for rows (the staff board): 40 high, radius 8, 14/20 500. */
export const smallPrimaryButton = `${button} h-10 rounded-lg px-3 bg-ink text-label text-white disabled:bg-disabled disabled:text-disabled-text`;

/** A small secondary for rows (the staff board). */
export const smallSecondaryButton = `${button} h-10 rounded-lg px-3 bg-well text-label text-ink not-disabled:hover:bg-tag disabled:text-disabled-text`;

/** A text link styled as a quiet button. */
export const linkButton = `inline-flex min-h-11 items-center rounded-lg text-label text-ink underline underline-offset-4 hover:text-ink-2 ${press} ${focus}`;

/** A grey pill (Add items, Refresh): 36 high, `well`, padding 0 16, 14/20 500. */
export const pillButton = `inline-flex h-9 items-center gap-1.5 rounded-full bg-well px-4 text-label text-ink hover:bg-tag ${press} ${focus}`;

/** The round white surface with a soft shadow, without its motion (the quick-add control brings its own, §11.9 M5). */
export const roundSurface =
  "grid place-items-center rounded-full bg-white text-ink shadow-[0_1px_6px_rgba(0,0,0,0.18)]";

/** A round white button with a soft shadow (over tiles and the cover). */
export const roundButton = `${roundSurface} ${press} ${focus}`;

/** A 36 × 36 round button inside a stepper pill (the item page's stepper, the drink pill). */
export const stepButton = `grid size-9 place-items-center rounded-full text-ink disabled:text-mute ${press} ${focus}`;

/** A white card with a hairline border, radius 12. */
export const card = "rounded-xl border border-line bg-white";

/** A text input: 48 high, radius 8, `well`, 16/20 (16 px keeps iOS from zooming in), a 2 px `ink` ring inside
 * when focused. */
export const textInput =
  "h-12 w-full rounded-lg bg-well px-4 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ink focus:ring-inset";

/** A section heading, 20/24 700. */
export const sectionHeading = "text-heading";

/** The green tag ("Popular", "Ready"): 20 high, radius 4, 12/16 500 white. */
export const greenTag =
  "inline-flex h-5 items-center rounded bg-green px-1.5 text-caption-strong text-white";

/** The tag shape of Required / Optional and the staff status tags: 24 high, radius 6, 14/20 500. */
export const tagShape = "inline-flex h-6 items-center rounded-md px-2 text-label";

/** The grey tag ("Required", "Optional"). */
export const greyTag = `${tagShape} bg-tag text-ink`;

/** An inline error box. */
export const errorBox = "rounded-lg bg-negative-soft px-4 py-3 text-body-sm text-negative";

/** The 4 px band between page sections, full bleed, as the reference separates them. */
export const sectionBand = "-mx-4 h-1 bg-line-2";

/** The container of a button pinned to the bottom of the screen: white, padding 12 16 and the safe area. */
export const pinnedBar =
  "fixed inset-x-0 bottom-0 z-20 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]";

export { focus as focusRing };
