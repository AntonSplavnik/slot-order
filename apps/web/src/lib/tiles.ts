import type { MenuItem } from "@slot-order/core";

// The coloured tiles that stand in for photos (docs/design.md §11.6): a warm six-colour palette cycling by the
// item's position on the screen, a large emoji per seed item, the name's initial for any other id.

export type Tile = { bg: string; glyph: string };

/** Six Tailwind background classes, written out in full so Tailwind finds them. */
export const TILE_PALETTE = [
  "bg-amber-100",
  "bg-orange-100",
  "bg-rose-100",
  "bg-lime-100",
  "bg-sky-100",
  "bg-violet-100",
] as const;

/** The glyph of each seed item (supabase/seed.sql). */
const GLYPHS: Record<string, string> = {
  "half-chicken": "🍗",
  "chicken-burger": "🍔",
  "chicken-wings": "🔥",
  fries: "🍟",
  coleslaw: "🥗",
  ayran: "🥛",
  cola: "🥤",
  water: "💧",
  "burger-menu": "🍱",
  "wings-menu": "🍱",
};

/** The tile of `item` at position `index`: the palette by index (any integer, wrapped), the glyph by id. */
export function tileFor(item: MenuItem, index: number): Tile {
  const n = TILE_PALETTE.length;
  const slot = ((Math.trunc(index) % n) + n) % n;
  return {
    bg: TILE_PALETTE[slot] ?? TILE_PALETTE[0],
    glyph: GLYPHS[item.id] ?? item.name.trim().charAt(0).toUpperCase(),
  };
}
