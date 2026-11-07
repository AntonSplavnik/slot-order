// The look shared by the screens (docs/design.md §11.1: Tailwind defaults and one accent, orange-600). Class
// strings only: no behaviour lives here.

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2";

const button = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

/** The one action of a screen or card. */
export const primaryButton = `${button} bg-orange-600 text-white enabled:hover:bg-orange-700 enabled:active:bg-orange-800`;

/** A second, quieter action. */
export const secondaryButton = `${button} border border-stone-300 bg-white text-stone-900 enabled:hover:bg-stone-50 enabled:active:bg-stone-100`;

/** A small primary for rows (the staff board). */
export const smallPrimaryButton = `inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors enabled:hover:bg-orange-700 enabled:active:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

/** A text link styled as a quiet button. */
export const linkButton = `inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline ${focus}`;

/** A rounded white card. */
export const card = "rounded-2xl border border-stone-200 bg-white";

/** A labelled text input (text-base keeps iOS from zooming in). */
export const textInput =
  "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-400 transition-colors focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-600/30";

/** A section heading inside a card. */
export const cardHeading = "text-lg font-semibold";

export { focus as focusRing };
