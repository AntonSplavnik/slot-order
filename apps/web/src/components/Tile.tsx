import type { MenuItem, PublicMenu } from "@slot-order/core";
import { menuSections } from "@/lib/menu";
import { tileFor } from "@/lib/tiles";

// The coloured tile that stands in for an item's photo (docs/design.md §11.6, §11.2 `tiles.ts`).

/** Each item's position on the menu screen (all sections in order), so an item keeps its colour everywhere. */
export function tilePositions(menu: PublicMenu): Map<string, number> {
  return new Map(
    menuSections(menu)
      .flatMap((section) => section.items)
      .map((item, index) => [item.id, index]),
  );
}

const SIZE = {
  /** The menu grid: 4:3, the glyph at text-5xl. */
  grid: "aspect-[4/3] w-full rounded-xl text-5xl",
  /** The hero across the top of the item sheet. */
  hero: "aspect-video w-full text-7xl",
  /** A cart line: 64 px. */
  line: "size-16 shrink-0 rounded-xl text-3xl",
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
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center leading-none font-bold text-neutral-700 select-none ${bg} ${SIZE[size]}`}
    >
      {glyph}
    </span>
  );
}
