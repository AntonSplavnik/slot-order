# M6 brief: photo tiles, the tests (red)

Anton approved stock photos in the item tiles instead of the coloured glyph tiles. **`docs/design.md` §11.8** is the
contract (read it, then §11.2 `photos.ts` and §11.4). You write the tests of the library part; the stub
`apps/web/src/lib/photos.ts` throws / is empty, so your tests must be **red** on it for the right reasons and will go
green once the implementer fills the map and copies the files.

## You own
`apps/web/test/photos.test.ts` only. Nothing else: not the stub, not other tests, not `public/`, not configs.

## Read first
`docs/design.md` §11.8, §11.2 (the `photos.ts` entry), §11.4; `apps/web/src/lib/photos.ts` (the stub);
`apps/web/test/tiles.test.ts` and `apps/web/test/helpers.ts` (style, and `publicMenu` / `seedMenu` for the seed ids);
`apps/web/vitest.config.ts` (environment node).

## The tests (titles say what they check; `describe`/`it` as in tiles.test.ts)
- `PHOTOS` has exactly the seed item ids as keys: the set of keys equals the set of `publicMenu.items.map(i => i.id)`
  (10 ids: half-chicken, chicken-burger, chicken-wings, fries, coleslaw, ayran, cola, water, burger-menu,
  wings-menu); no extra key.
- For every seed item: `photoFor(id)` returns the entry of `PHOTOS`, with `src === "/items/" + id + ".jpg"`.
- For every seed item: the file `apps/web/public/items/<id>.jpg` exists (resolve it from the test file:
  `new URL("../public/items/<id>.jpg", import.meta.url)`), starts with the JPEG magic bytes `FF D8 FF`, and is at
  most 120 KB (122880 bytes). Read with `node:fs` (`readFileSync`, `statSync`).
- `coverPhoto()` returns `{ src: "/items/cover.jpg", alt }`; the file exists, is a JPEG and at most 250 KB.
- Alt texts: for every entry and the cover, `alt` is a non-empty string of at most 120 characters, and differs from
  the item's name (`publicMenu.items.find(...)!.name`), case-insensitively.
- `photoFor("nope")` and `photoFor("")` are `undefined`.
- `photoFor` and `coverPhoto` answer the same object on two calls (deterministic, no I/O side effects to observe:
  just `toBe`/`toEqual` equality).

## Done means
- `pnpm --filter @slot-order/web test` runs your file: every test in it **fails** on the stub (the map is empty, the
  functions throw), the other 229 tests stay green. `pnpm typecheck` and `pnpm check` (run `pnpm format`) pass.
- Your report: the file, the number of tests, how each fails on the stub (one line each), and any point where §11.8
  was unclear (`// SPEC:` comments in the test).
- You never commit, push or touch anything outside your file.
