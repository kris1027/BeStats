# TMDB image loader

## Goal

Stop Vercel Image Optimization from running on every TMDB image. The Hobby
quota (5,000 transformations a month) is at 5.1K. A transformation is one unique
source URL × width × quality × format, so a catalog with thousands of posters,
backdrops, profiles and stills, several `srcset` widths each, and crawlers that
walk the sitemap will pass that quota at any traffic level.

TMDB's CDN already serves every image pre-sized (`w92` … `w1280`) and returns
WebP when the browser's `Accept` header allows it, so Vercel's resize is
redundant. A custom `next/image` loader sends the browser straight to the
TMDB size that fits, so Vercel does no transformations at all.

## Inspected

- `next.config.ts`: `images.remotePatterns` for `image.tmdb.org/t/p/**` and
  nothing else, so the default loader with default `deviceSizes`/`imageSizes`
  is in use.
- `lib/tmdb/images.ts`: `TmdbImageSize`, the pinned per field sizes
  (`POSTER_SIZE` w500, `BACKDROP_SIZE` w1280, `PROFILE_SIZE` w185,
  `STILL_SIZE` w300, `COMPANY_LOGO_SIZE` w154, `PROVIDER_LOGO_SIZE` w92),
  `imageUrl`, `resizeImageUrl`.
- Every `next/image` user: `poster-card`, `list-cards`, `catalog-list-cards`,
  `carousel-row`, `cast-row`, `title-extras`, `detail-hero`, `season-header`,
  `season-grid`, `episode-row`, `quick-search-row`, `where-to-watch`,
  `title-details`, the library cards, `/showcase`. All pass TMDB URLs built by
  `lib/tmdb`. `site-footer` renders the local TMDB logo SVG `unoptimized`, so
  the loader is never called for it.
- `node_modules/next/dist/docs/.../images.md`: `loader: "custom"` +
  `loaderFile`, a `'use client'` module with a default export
  `({ src, width, quality }) => string`.
- `node_modules/next/dist/shared/lib/get-img-props.js`: in development Next
  warns when the loader's URL equals `src`, i.e. it "does not implement width".
- Live TMDB check (2026-10-16): `w45, w92, w154, w185, w300, w342, w500, w780,
  w1280, h632, original` all return 200 for a poster, a backdrop and a profile
  path; `w640` returns 400. Responses carry `cache-control: public,
  max-age=31919000` and come back as `image/webp` for `Accept: image/webp`.
- `lib/legal/operator.ts` and `app/privacy/page.tsx`: the policy says TMDB
  "receives no personal data from you … our host delivers the images", and
  `PROCESSORS` gives Vercel the job "delivers catalog images".

## Skills used

None of the installed skills cover image loaders. The Next.js docs shipped in
`node_modules` are the reference.

## Decisions

1. **Images load directly from `image.tmdb.org`** (your choice, 2026-10-16),
   not through a same-origin Vercel rewrite, which would only swap image
   transformations for edge requests and origin transfer.
2. **Width ladder:** `w92, w154, w185, w300, w342, w500, w780, w1280`, kept as
   `TMDB_IMAGE_WIDTHS` in `images.ts`, the one list `TmdbImageSize` is built
   from too (amended after review). The loader picks the smallest rung ≥ the requested width. `original` is never
   chosen, because it can be several MB.
3. **The size `lib/tmdb` pinned stays the ceiling.** A `w500` poster is never
   upgraded to `w780` on a 3× screen, so no image becomes heavier than it is
   today and `images.ts`' rule that a page can't quietly request larger images
   still holds. Wide `srcset` entries collapse to the same URL, and the browser
   dedupes them.
4. **Anything else passes through unchanged:** a URL that isn't
   `https://image.tmdb.org/t/p/<size>/<file>`, or that has an unknown size,
   comes back untouched. The loader never builds a URL for another host.
   Next's dev warning ("does not implement width") then names that image, the
   signal to pin it to a ladder size; no caller does so today.
   `remotePatterns` stays in the config as documentation of the one allowed
   host. (2026-10-19: removed, with `localPatterns: []` added, because it kept
   `/_next/image` transforming old URLs; see prompts/close-image-optimizer.md.)
5. **`quality` is ignored**, because TMDB has no quality parameter.
5a. **A URL already at its own size gets a `#same-size` fragment** (found while
   verifying): Next's dev check warns "does not implement width" whenever the
   loader returns `src` unchanged, which every image at its pinned size does.
   A fragment never reaches TMDB, so the request and its cache entry are
   unchanged.
6. **Privacy text follows the code** (AGENTS.md: legal pages describe only what
   the code does):
   - Vercel's `PROCESSORS` purpose becomes "Hosts the website and keeps request
     logs."
   - TMDB joins `PROCESSORS` ("Delivers posters, photos and other catalog
     images straight to your browser, which shares your IP address with it.",
     `https://www.themoviedb.org`), following the YouTube precedent.
   - The paragraph under "Who processes your data" becomes: our server makes
     the catalog requests, so TMDB receives no account or tracking data; your
     browser loads the images from TMDB's image service, which sees your IP
     address and browser details, and TMDB's privacy policy applies.
   - "Transfers outside the EEA" adds that TMDB is a United States company.
   - `LEGAL_LAST_UPDATED` moves to `2026-10-16`.
   - The wording is the operator's legal text. Review it in the PR.

## Expected files

- `lib/tmdb/image-loader.ts` (new): `'use client'`, pure, the default export
  loader plus an exported `tmdbImageLoader` for tests. Imports only
  `TMDB_IMAGE_BASE` and the size type, nothing `server-only`.
- `lib/tmdb/image-loader.test.ts` (new).
- `next.config.ts`: `images.loader: "custom"`, `loaderFile:
  "./lib/tmdb/image-loader.ts"`, and its JSDoc saying why.
- `next.config.test.ts`: pin `loader: "custom"` and the loader file.
- `lib/legal/operator.ts`, `app/privacy/page.tsx`, `app/privacy/page.test.tsx`
  where needed.
- `lib/tmdb/AGENTS.md`: one line on the loader and the ceiling rule.

## Requirements

- R1. No `next/image` in the app requests `/_next/image`.
- R2. Every TMDB `srcset` candidate is a valid TMDB size path no larger than the
  size `lib/tmdb` chose.
- R3. Non TMDB or unrecognised URLs pass through unchanged.
- R4. No visual change: same layout, `sizes`, placeholders and missing image
  states.
- R5. The privacy page and `PROCESSORS` describe the new image path.

## Security and privacy

- The loader runs in the browser, but it only rewrites the size segment of
  public CDN URLs. No token or env value is involved, and
  `security-boundary.test.ts` still holds.
- Visitors' IP addresses now reach TMDB's image CDN. The privacy text changes
  in the same PR, as AGENTS.md requires.
- There is no open redirect or host widening: the loader never builds a URL for
  a host it was not given.

## Acceptance criteria

- AC-1. `tmdbImageLoader({ src: ".../w500/x.jpg", width: 200 })` returns
  `.../w300/x.jpg`. Width 92 returns `w92`, width 342 returns `w342`, and width
  3840 returns `.../w500/x.jpg#same-size` (the ceiling, marked per 5a).
- AC-2. A `w1280` backdrop at width 828 returns `.../w1280/x.jpg#same-size`.
  At width 640 it returns `w780`.
- AC-3. `original`, `h632` or unknown sources: the ceiling is treated as
  `w1280` for `original`, and anything not on the ladder or not under the TMDB
  base is returned unchanged.
- AC-4. `next.config` declares `loader: "custom"` and `loaderFile`.
- AC-5. A production build and a page load show `<img srcset>` pointing at
  `image.tmdb.org`, with no `/_next/image` requests and no loader width
  warning in dev.
- AC-6. `/privacy` lists TMDB, Vercel's purpose no longer mentions images, and
  `Last updated` reads 16 October 2026.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev`, then open `/shows`. In DevTools → Network → Img, every poster
   request goes to `image.tmdb.org/t/p/w…/…`, and none to `/_next/image`.
2. Inspect a poster `<img>`: `srcset` lists TMDB size URLs, none larger than
   `w500`.
3. Open a show page: the backdrop loads from `w780`/`w1280`, cast photos from
   `w92`–`w185`, and the season episode stills from up to `w300`.
4. Toggle a mobile viewport and reload: smaller rungs are fetched.
5. Check that a title with no poster still shows the placeholder.
6. Open `/privacy`: TMDB is listed and the date is updated.
7. After deploy, Vercel → Usage → Image Optimization: the transformation count
   stops growing.
