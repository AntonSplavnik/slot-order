import { describe, expect, it } from "vitest";
import { TILE_PALETTE, tileFor } from "../src/lib/tiles";
import { item, publicMenu } from "./helpers";

// The coloured tiles that stand in for photos (docs/design.md §11.6, docs/handoffs/m6-web-design.md): a six-colour
// palette cycling by position, an emoji glyph per seed item, the name's initial for anything else.

describe("tileFor", () => {
  it("has a palette of six Tailwind background classes", () => {
    expect(TILE_PALETTE).toHaveLength(6);
    expect(new Set(TILE_PALETTE).size).toBe(6);
    for (const bg of TILE_PALETTE) expect(bg).toMatch(/^bg-[a-z]+-\d+$/);
  });

  it("cycles the palette by index", () => {
    const fries = item("fries");
    expect(tileFor(fries, 0).bg).toBe(tileFor(fries, 6).bg);
    expect(tileFor(fries, 0).bg).not.toBe(tileFor(fries, 1).bg);
    for (let i = 0; i < 12; i++) expect(tileFor(fries, i).bg).toBe(TILE_PALETTE[i % 6]);
  });

  it("keeps a negative or fractional index inside the palette", () => {
    const fries = item("fries");
    expect(TILE_PALETTE).toContain(tileFor(fries, -1).bg);
    expect(TILE_PALETTE).toContain(tileFor(fries, 2.5).bg);
  });

  it("gives every seed item an emoji glyph, not its initial", () => {
    for (const menuItem of publicMenu.items) {
      const { glyph } = tileFor(menuItem, 0);
      expect(glyph).not.toBe(menuItem.name.charAt(0).toUpperCase());
      expect(glyph).toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("maps the seed items to their glyphs", () => {
    expect(tileFor(item("half-chicken"), 0).glyph).toBe("🍗");
    expect(tileFor(item("chicken-burger"), 0).glyph).toBe("🍔");
    expect(tileFor(item("fries"), 0).glyph).toBe("🍟");
    expect(tileFor(item("coleslaw"), 0).glyph).toBe("🥗");
    expect(tileFor(item("ayran"), 0).glyph).toBe("🥛");
    expect(tileFor(item("cola"), 0).glyph).toBe("🥤");
    expect(tileFor(item("water"), 0).glyph).toBe("💧");
    expect(tileFor(item("burger-menu"), 0).glyph).toBe("🍱");
    expect(tileFor(item("wings-menu"), 0).glyph).toBe("🍱");
  });

  it("gives an unknown id the name's initial, upper-cased", () => {
    const unknown = { ...item("fries"), id: "falafel-wrap", name: "falafel wrap" };
    expect(tileFor(unknown, 0).glyph).toBe("F");
  });

  it("answers the same tile for the same input", () => {
    const burger = item("chicken-burger");
    expect(tileFor(burger, 3)).toEqual(tileFor(burger, 3));
  });
});
