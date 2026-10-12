# Home carousels review fixes

## Goal

Act on the two axis code review of `feat/home-carousels` (spec 0021) before it merges: close a soft 404 in the proxy, bring two AGENTS.md files and the spec text up to date, and remove the duplication the review flagged. One small commit per fix.

## Inspected

- `proxy.ts`, `proxy.test.ts`
- `lib/catalog/lists.ts` (+ test), `lib/catalog-list-read.ts`, `lib/landing-metadata.ts`, `app/sitemap.ts`
- `lib/tmdb/lists.ts`, `lib/tmdb/reads.ts`, `lib/tmdb/AGENTS.md`, `lib/seo/AGENTS.md`
- `components/catalog/catalog-list-page.tsx`, `carousel-row.tsx`, `carousel-row-states.tsx`, `list-cards.tsx`, `app/showcase/page.tsx`
- `docs/specs/0021-home-carousels/index.md`
- The running dev server: `/shows/top%2Drated` answers **200** with "Show not found" (`noindex`). The proxy decodes the segment, matches the slug and lets it through, but Next routes the encoded path to `[id]`, not to the static `top-rated` folder.

## Decisions (one commit each, in this order)

1. **Proxy: match list slugs on the raw segment** (spec AC-13, "exact, case sensitive"). `isCatalogListSlug` gets `match[1]` undecoded, so `/shows/top%2Drated` falls through to the id parser and gets a real 404. Rename the field `lists` to `listMediaType`. Add the encoded paths to the 404 cases in `proxy.test.ts`.
2. **Registry entry in, path out.** `listPath(list)` and `listPageHref(list, page)` take the `CatalogList` instead of a `(mediaType, slug)` pair; the five callers and `lists.test.ts` follow. `isCatalogListSlug` keeps a plain `string` segment because it validates untrusted input.
3. **Showcase See all** uses `listPath(catalogList("tv", "top-rated"))` instead of a hard coded href.
4. **One empty row text.** Drop `emptyRowText` from the registry; `CarouselRowEmpty` renders the one constant.
5. **One list fetcher.** `fetchTvList` and `fetchMovieList` keep their signatures but share one private helper (endpoint, place param, schema, normalizer).
6. **One card mapper.** `ListGridCards` and `RowCards` become one `CatalogListCards` in `list-cards.tsx` (result, return path, eager count, optional `sizes`, optional `itemClassName`); the row passes its first 12.
7. **JSDoc** on the exported `getTvList` and `getMovieList` (`AGENTS.md`, Code conventions).
8. **Docs.** `lib/tmdb/AGENTS.md`: add `lists.ts`, and `hours` for the list reads. `lib/seo/AGENTS.md`: canonicals carry `?page=N` on list pages only, and the sitemap shares Popular's discover calls with `/shows/popular` and `/movies/popular`. Spec 0021: the reads use new list item schemas that add `adult`, and the empty list page panel is titled "This list is empty".

Kept as is: `readTaggedCatalogList` (it avoids a cast, the review calls it justified), the `/showcase` row (allowed by build step 10), the media type branch in `readCatalogList` (it is the dispatcher's job) and `LANDING_LABELS` (one use).

## Security

Fix 1 tightens the proxy: an encoded list slug now gets a real 404 instead of a soft one. Nothing else touches auth, caching or data access.

## Acceptance criteria

- `/shows/top%2Drated` and `/movies/now%2Dplaying` answer 404; every AC-13 path still behaves as before.
- Landings, rows, list pages, pagination, sitemap and `/showcase` render exactly as before.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test

1. With `pnpm dev` running, `curl -o /dev/null -w '%{http_code}' localhost:3000/shows/top%2Drated` prints 404, and `/shows/top-rated` prints 200.
2. Open `/shows` and `/movies`: five rows each with cards; See all opens the list page; page 2 works.
3. Open `/showcase`: the carousel row section still shows its four states, and its See all goes to `/shows/top-rated`.
