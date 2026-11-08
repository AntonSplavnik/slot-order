// The photos in the item tiles (docs/design.md §11.8, §11.2): a map from the seed ids to a file under
// `public/items/` and a short description; `photoFor` for the tiles (undefined → the coloured glyph tile),
// `coverPhoto` for the store page's cover. Pure data, no I/O.

export type Photo = { src: string; alt: string };

/** One photo per seed item (supabase/seed.sql), by item id. */
export const PHOTOS: Readonly<Record<string, Photo>> = {};

/** The photo of `itemId`, or undefined for an id without one. */
export function photoFor(_itemId: string): Photo | undefined {
  throw new Error("not implemented");
}

/** The store page's cover photo. */
export function coverPhoto(): Photo {
  throw new Error("not implemented");
}
