// The photos in the item tiles (docs/design.md §11.8, §11.2): a map from the seed ids to a file under
// `public/items/` and a short description; `photoFor` for the tiles (undefined → the coloured glyph tile),
// `coverPhoto` for the store page's cover. Pure data, no I/O.

export type Photo = { src: string; alt: string };

/** One photo per seed item (supabase/seed.sql), by item id. */
export const PHOTOS: Readonly<Record<string, Photo>> = {
  "half-chicken": {
    src: "/items/half-chicken.jpg",
    alt: "Grilled chicken halves on a rack over dark slate",
  },
  "chicken-burger": {
    src: "/items/chicken-burger.jpg",
    alt: "A crispy chicken burger on a black plate",
  },
  "chicken-wings": {
    src: "/items/chicken-wings.jpg",
    alt: "Glazed wings with chilies on dark wood",
  },
  fries: { src: "/items/fries.jpg", alt: "Herb fries in a white bowl on a dark table" },
  coleslaw: { src: "/items/coleslaw.jpg", alt: "Coleslaw in a dark-rimmed bowl" },
  ayran: { src: "/items/ayran.jpg", alt: "A glass of a white drink on black" },
  cola: { src: "/items/cola.jpg", alt: "A glass of cola with ice on a near-black surface" },
  water: { src: "/items/water.jpg", alt: "A tall glass of water on black" },
  "burger-menu": {
    src: "/items/burger-menu.jpg",
    alt: "A burger, fries and a glass of cola on black",
  },
  "wings-menu": {
    src: "/items/wings-menu.jpg",
    alt: "Wings on a dark plate with fries at the edge",
  },
};

const COVER: Photo = { src: "/items/cover.jpg", alt: "Sliced grilled chicken on black slate" };

/** The photo of `itemId`, or undefined for an id without one (an own-property lookup, so `"constructor"` and
 * the like are unknown ids too). */
export function photoFor(itemId: string): Photo | undefined {
  return Object.hasOwn(PHOTOS, itemId) ? PHOTOS[itemId] : undefined;
}

/** The store page's cover photo. */
export function coverPhoto(): Photo {
  return COVER;
}
