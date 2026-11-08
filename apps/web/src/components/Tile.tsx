import type { MenuItem, PublicMenu } from "@slot-order/core";
import { menuSections } from "@/lib/menu";
import { tileFor } from "@/lib/tiles";

// The coloured tile that stands in for an item's photo (docs/design.md §11.6, §11.7, §11.2 `tiles.ts`).

/** Each item's position on the menu screen (all sections in order), so an item keeps its colour everywhere. */
export function tilePositions(menu: PublicMenu): Map<string, number> {
  return new Map(
    menuSections(menu)
      .flatMap((section) => section.items)
      .map((item, index) => [item.id, index]),
  );
}

const SIZE = {
  /** The menu grid: square, radius 12, the glyph at text-6xl. */
  grid: "aspect-square w-full rounded-xl text-6xl",
  /** The hero across the top of the item sheet: 230 high, the glyph at text-8xl. */
  hero: "h-[230px] w-full text-8xl",
  /** A cart line: 72 square, radius 12. */
  line: "size-18 shrink-0 rounded-xl text-4xl",
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
      className={`grid place-items-center leading-none font-bold text-ink-2 select-none ${bg} ${SIZE[size]}`}
    >
      {glyph}
    </span>
  );
}
