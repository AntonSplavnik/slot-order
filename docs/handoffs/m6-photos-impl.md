# M6 brief: photo tiles, the implementation

Anton approved stock photos in the item tiles (mock: `reference/photo-mock/index.html`, git-ignored). **`docs/design.md`
§11.8** is the contract (files, the table of photos, the library, the rendering, the tests); §11.2 `photos.ts`, §11.3
(`_headers`), §11.6 and §11.7 for the surrounding look. The tests exist and are red: `apps/web/test/photos.test.ts`.
Make them green without touching them, and restyle the three places that show a tile.

## You own
- `apps/web/src/lib/photos.ts` (replace the stub), `apps/web/public/items/**` (new: the eleven JPEGs and
  `CREDITS.md`), `apps/web/public/_headers` (add the `/items/*` rule, one day), `apps/web/src/components/Tile.tsx`,
  `apps/web/src/app/page.tsx` (the cover band only). `apps/web/src/components/OptionSheet.tsx` and
  `apps/web/src/app/checkout/page.tsx` use `Tile` and should need no change; touch them only if a size class must
  move.
- Nothing else: no tests, no configs besides `_headers`, no `package.json`, no other library files, no `tiles.ts`.

## The images
- The approved files are in `reference/photo-mock/downloads/` (600 × 600 JPEGs: `half.jpg`, `burger.jpg`,
  `wings.jpg`, `fries.jpg`, `slaw.jpg`, `ayran.jpg`, `cola.jpg`, `water.jpg`, `bmenu.jpg`, `wmenu.jpg`; `cover.jpg`
  780 × 520) with their source URLs in `reference/photo-mock/photo-urls.txt`. Copy them to
  `apps/web/public/items/<item id>.jpg` with the ids of §11.8's table (half → `half-chicken.jpg`, slaw →
  `coleslaw.jpg`, bmenu → `burger-menu.jpg`, wmenu → `wings-menu.jpg`, …).
- The cover: fetch a larger rendition from its URL with `w=1284&h=780&fit=crop` (curl into `public/items/cover.jpg`),
  check it is a JPEG (`file`, `sips -g pixelWidth -g pixelHeight`) under 250 KB; if the fetch fails or the file is
  bigger, use the 780 × 520 copy.
- Verify every file: JPEG magic bytes, the dimensions, the size limits of §11.8 (items ≤ 120 KB). Do not recompress
  with tools that are not installed; the sizes already fit.
- `CREDITS.md`: one line per file with item, photographer, source page URL (from §11.8's table: Pexels
  `https://www.pexels.com/photo/<id>/`, Unsplash `https://unsplash.com/photos/<id>`) and the licence name
  ("Pexels License" / "Unsplash License"), plus one sentence that the photos are not the reference restaurant's.
- Nothing from the reference screenshots (`reference/uber-eats/`) is used.

## The code
- `photos.ts` as §11.2/§11.8: `PHOTOS` with the ten entries (alt texts: a few words describing the picture, not the
  item name), `photoFor`, `coverPhoto`.
- `Tile.tsx`: same props and sizes; with a photo render `<img src={photo.src} alt="" width={600} height={600}
  loading="lazy" decoding="async" className="h-full w-full object-cover">` inside the rounded, `overflow-hidden`
  box (the box keeps `aria-hidden`); without one, the glyph tile exactly as now. The hero size (230 high) and the
  72 px line size work with `object-cover`.
- `page.tsx` cover band: the cover photo (`absolute inset-0 h-full w-full object-cover`, `width={1284}
  height={780}`, `fetchPriority="high"`, `alt=""`), a gradient overlay (`bg-linear-to-b from-black/20
  via-transparent to-black/10`, `via` at about 35 %), the mark and the cart button as they are; the glyph pattern
  and the amber gradient go. Keep the band 260 high and everything else untouched.
- Formatting: `pnpm format` before `pnpm check`. No new dependencies; no `next/image`.

## From the test agent (the tests are the truth)
- 9 tests in `apps/web/test/photos.test.ts`. `photoFor` must use an own-property lookup (`Object.hasOwn(PHOTOS, id)
  ? PHOTOS[id] : undefined`): the tests ask `photoFor("constructor")`, `"toString"` and `"__proto__"` for
  `undefined`, and `Object.keys(PHOTOS)` must be exactly the ten seed ids.
- `photoFor(id)` must return the very object stored in `PHOTOS` (`toBe`); `coverPhoto()` may return a shared
  constant (`toEqual`), with exactly the keys `src` and `alt`.
- Alt texts: non-empty, at most 120 characters, and not equal to the item's name (case and surrounding spaces
  ignored); containing the name is fine.
- The file tests resolve `../public/items/<id>.jpg` from the test file, check the magic bytes `FF D8 FF` and the
  size limits (items ≤ 122880 bytes, cover ≤ 256000 bytes).

## Done means
- `pnpm test` green everywhere (web: 229 + the photo tests), `pnpm typecheck`, `pnpm check`,
  `pnpm --filter @slot-order/web build`, and the OpenNext build (`pnpm --filter @slot-order/web exec
  opennextjs-cloudflare build`) produces `.open-next/worker.js` and copies `public/items/*` into
  `.open-next/assets/items/` (check).
- Render `/` and the item sheet at 390 × 844 with headless Chrome against `next dev -p 3001` and the local API
  (`pnpm --filter @slot-order/api exec wrangler dev --var WEB_ORIGIN:http://localhost:3001`; the local Supabase is
  running) and confirm the photos show (the cover, the grid, the hero). Save the shots under
  `/private/tmp/claude-501/-Users-antonsplavnik-Documents-Programming-Projects-slot-order/a3e11c8e-ebb2-406c-9bc2-d556fd53fcbf/scratchpad/shots4/`.
  Stop the servers afterwards.
- Report: the files changed and added (with sizes), the check results with counts, the shot paths, anything in
  §11.8 you could not follow and what you did instead. You never commit, push or deploy.
