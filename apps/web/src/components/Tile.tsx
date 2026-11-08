import type { MenuItem, PublicMenu } from "@slot-order/core";
import { menuSections } from "@/lib/menu";
import { photoFor } from "@/lib/photos";
import { tileFor } from "@/lib/tiles";

// An item's tile (docs/design.md §11.6, §11.7, §11.8): its photo when `photos.ts` has one, else the coloured
// glyph tile that stands in for it (§11.2 `tiles.ts`). Decorative: the item's name stands beside it.

/** Each item's position on the menu screen (all sections in order), so an item keeps its colour everywhere. */
export function tilePositions(menu: PublicMenu): Map<string, number> {
  return new Map(
    menuSections(menu)
      .flatMap((section) => section.items)
      .map((item, index) => [item.id, index]),
  );
}

const SIZE = {
  /** The menu grid: square, radius 12, the glyph at text-6xl (a photo fills the box). */
  grid: "aspect-square w-full rounded-xl text-6xl",
  /** The hero across the top of the item page: 230 high, full bleed, the glyph at text-8xl. */
  hero: "h-[230px] w-full text-8xl",
  /** A cart line: 72 square, radius 12. */
  line: "size-18 shrink-0 rounded-xl text-4xl",
  /** An "Add a drink" row on the item page (§11.9): 48 square, radius 8. */
  row: "size-12 shrink-0 rounded-lg text-3xl",
} as const;

export function Tile({
  item,
  index,
  size,
}: {
  item: MenuItem;
  index: number;
  size: keyof typeof SIZE;
}) {
  const { bg, glyph } = tileFor(item, index);
  const photo = photoFor(item.id);
  if (photo !== undefined) {
    // The tile's colour shows while the photo loads.
    return (
      <span aria-hidden="true" className={`block overflow-hidden ${bg} ${SIZE[size]}`}>
        {/* biome-ignore lint/performance/noImgElement: plain files from public/, no image optimiser on the Worker (§11.8) */}
        <img
          src={photo.src}
          alt=""
          width={600}
          height={600}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center leading-none font-bold text-ink-2 select-none ${bg} ${SIZE[size]}`}
    >
      {glyph}
    </span>
  );
}
