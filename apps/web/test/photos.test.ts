import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coverPhoto, PHOTOS, type Photo, photoFor } from "../src/lib/photos";
import { item, publicMenu } from "./helpers";

// The photos in the item tiles (docs/design.md §11.8, §11.2, docs/handoffs/m6-photos-tests.md): one photo per
// seed item and a cover, as files under `public/items/`. The library is pure data; only this test reads files.

const SEED_IDS = publicMenu.items.map((i) => i.id);

const ITEM_MAX_BYTES = 120 * 1024;
const COVER_MAX_BYTES = 250 * 1024;
const ALT_MAX_CHARS = 120;

/** The map's entry for `id`; fails the test with the id when there is none. */
function entry(id: string): Photo {
  const photo = PHOTOS[id];
  if (photo === undefined) throw new Error(`PHOTOS has no entry for ${id}`);
  return photo;
}

/** Checks that `public/<path>` exists, starts with the JPEG magic bytes and is at most `maxBytes`. */
function expectJpeg(path: string, maxBytes: number): void {
  const url = new URL(`../public/${path}`, import.meta.url);
  expect(existsSync(url), `public/${path} exists`).toBe(true);
  const head = [...readFileSync(url).subarray(0, 3)];
  expect(head, `public/${path} starts with FF D8 FF`).toEqual([0xff, 0xd8, 0xff]);
  expect(statSync(url).size, `public/${path} is at most ${maxBytes} bytes`).toBeLessThanOrEqual(
    maxBytes,
  );
}

/** Checks that `alt` is a short, non-empty description. */
function expectAlt(alt: unknown, what: string): void {
  expect(typeof alt, `${what}: alt is a string`).toBe("string");
  const text = alt as string;
  expect(text.trim().length, `${what}: alt is not empty`).toBeGreaterThan(0);
  expect(text.length, `${what}: alt is at most ${ALT_MAX_CHARS} characters`).toBeLessThanOrEqual(
    ALT_MAX_CHARS,
  );
}

describe("PHOTOS", () => {
  it("has exactly the ten seed item ids as keys", () => {
    expect(SEED_IDS).toHaveLength(10);
    expect(new Set(Object.keys(PHOTOS))).toEqual(new Set(SEED_IDS));
  });
});

describe("photoFor", () => {
  it("answers the map's entry for every seed item, at /items/<id>.jpg", () => {
    for (const id of SEED_IDS) {
      const photo = photoFor(id);
      expect(photo, id).toBe(entry(id));
      expect(photo?.src, id).toBe(`/items/${id}.jpg`);
    }
  });

  it("answers undefined for an id without a photo", () => {
    expect(photoFor("nope")).toBeUndefined();
    expect(photoFor("")).toBeUndefined();
    // SPEC: §11.8 says "unknown id → undefined"; Object.prototype's keys are unknown ids too, so a bare
    // `PHOTOS[itemId]` lookup on a plain object would answer a function or the prototype here.
    expect(photoFor("constructor")).toBeUndefined();
    expect(photoFor("toString")).toBeUndefined();
    expect(photoFor("__proto__")).toBeUndefined();
  });

  it("answers the same object on two calls", () => {
    for (const id of SEED_IDS) expect(photoFor(id), id).toBe(photoFor(id));
  });
});

describe("coverPhoto", () => {
  it("answers /items/cover.jpg with an alt text", () => {
    const cover = coverPhoto();
    expect(cover.src).toBe("/items/cover.jpg");
    expect(Object.keys(cover).sort()).toEqual(["alt", "src"]);
    expectAlt(cover.alt, "cover");
  });

  it("answers an equal object on two calls", () => {
    // SPEC: §11.8 does not say whether the cover is one shared object or a fresh one per call; equality is
    // what the screens need, so the test asks for `toEqual`, not `toBe`.
    expect(coverPhoto()).toEqual(coverPhoto());
  });
});

describe("the files under public/items", () => {
  it("has a JPEG of at most 120 KB for every seed item", () => {
    for (const id of SEED_IDS) expectJpeg(`items/${id}.jpg`, ITEM_MAX_BYTES);
  });

  it("has the cover as a JPEG of at most 250 KB", () => {
    expectJpeg("items/cover.jpg", COVER_MAX_BYTES);
  });
});

describe("alt texts", () => {
  it("describe each item's picture in at most 120 characters, not by the item's name", () => {
    for (const id of SEED_IDS) {
      const { alt } = entry(id);
      expectAlt(alt, id);
      // SPEC: "differs from the item's name" is checked as whole-string inequality, case-insensitive and
      // ignoring surrounding spaces; an alt that contains the name ("a Chicken Burger on a black plate")
      // is allowed.
      expect(alt.trim().toLowerCase(), `${id}: alt is not the name`).not.toBe(
        item(id).name.trim().toLowerCase(),
      );
    }
  });
});
