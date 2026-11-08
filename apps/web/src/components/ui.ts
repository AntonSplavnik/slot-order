// The look shared by the screens (docs/design.md §11.6: a delivery app's store layout; white surfaces, black
// primaries, grey wells, hairlines). Class strings only: no behaviour lives here.

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

const button = `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${focus}`;

/** The one action of a screen: black, full-width where pinned, 52 px high. */
export const primaryButton = `${button} min-h-13 px-5 bg-neutral-900 text-white enabled:hover:bg-neutral-800 enabled:active:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400`;

/** A second, quieter action: a light grey well. */
export const secondaryButton = `${button} min-h-13 px-5 bg-neutral-100 text-neutral-900 enabled:hover:bg-neutral-200 enabled:active:bg-neutral-300 disabled:text-neutral-400`;

/** A small primary for rows (the staff board). */
export const smallPrimaryButton = `${button} min-h-11 px-3 text-sm bg-neutral-900 text-white enabled:hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400`;

/** A small secondary for rows (the staff board). */
export const smallSecondaryButton = `${button} min-h-11 px-3 text-sm bg-neutral-100 text-neutral-900 enabled:hover:bg-neutral-200 disabled:text-neutral-400`;

/** A text link styled as a quiet button. */
export const linkButton = `inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-neutral-900 underline underline-offset-4 hover:text-neutral-600 ${focus}`;

/** A pill-shaped grey button (Add items, Refresh). */
export const pillButton = `inline-flex min-h-10 items-center gap-1.5 rounded-full bg-neutral-100 px-4 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-200 ${focus}`;

/** A round white button with a soft shadow (over tiles and the cover). */
export const roundButton = `grid place-items-center rounded-full bg-white text-neutral-900 shadow-[0_1px_6px_rgba(0,0,0,0.18)] transition-transform active:scale-95 ${focus}`;

/** A white card with a hairline border. */
export const card = "rounded-xl border border-neutral-200 bg-white";

/** A text input in a grey well (text-base keeps iOS from zooming in). */
export const textInput =
  "min-h-12 w-full rounded-lg border border-transparent bg-neutral-100 px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-500 transition-colors focus:border-neutral-900 focus:bg-white focus:outline-none";

/** A section heading. */
export const cardHeading = "text-xl font-bold";

/** The green tag ("Popular", "Ready"). */
export const greenTag = "rounded bg-green-700 px-1.5 py-0.5 text-xs font-semibold text-white";

/** The grey tag ("Required", "Optional"). */
export const greyTag =
  "rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-semibold text-neutral-700";

/** An inline error box. */
export const errorBox = "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700";

/** A thick grey band between page sections, as the reference separates them. */
export const sectionBand = "-mx-4 h-2 bg-neutral-100";

/** The container of a button pinned to the bottom of the screen. */
export const pinnedBar =
  "fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]";

export { focus as focusRing };
