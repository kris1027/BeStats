# Full grid rows

## Goal

On every full page, every row of every title grid is filled at every width. Today a page holds 20 titles and the `catalog` grid steps 2/3/4/5/6 columns; 20 does not divide by 3 or 6, so at 6 columns (1280px and wider) a page ends 4 cards short. Move every paged grid to 24 titles and the columns to 2/3/4/6. Amends spec 0022 (AC-1, AC-2, AC-4, AC-6, new AC-21 and AC-22); decided in the 2026-10-13 grilling session.

## Inspected

- `components/poster-grid.tsx` and `poster-grid.test.tsx` (the presets, `sizes` rule, eager count)
- `components/catalog/catalog-list-page.tsx` (`PAGE_SIZE = 20` skeleton, `lastReachablePage`), `lib/catalog-list-read.ts` (`readCatalogList`, shared with the home rows and `generateMetadata`), `lib/landing-metadata.ts`
- `components/search/search-results.tsx` (`PAGE_SIZE = 20` skeleton, modes), `lib/search/read.ts` (`readSearchPage`, `readDiscoverPage`), `lib/search/mode.ts`, `lib/search/scan.ts`, `lib/search/constants.ts` (`TMDB_PAGE_SIZE`, `SCAN_TARGET`), `lib/search/count.ts`
- `lib/catalog/pages.ts` (`TMDB_MAX_PAGE = 500`, `parsePageParam`, `lastReachablePage`)
- `lib/tracking/library-lists.ts` (`LIBRARY_PAGE_SIZE = 20`, `libraryLastPage`, in memory slice and database range) and its test
- `components/library/library-panels.tsx` (`LibrarySkeleton` visibility list), `library-grid.tsx`, `show-library-tab.tsx`, `movie-library-tab.tsx`
- `docs/specs/0022-card-size-title-pages/` (amended in this change), and the specs that state 20 a page: 0006, 0008 (AC-11), 0009, 0020 (AC-16), 0021

## Skills

- `next-dev-loop` to check the grids and pagination in the running app.
- `supabase` is not needed: `LIBRARY_PAGE_SIZE` only changes the slice and the range, with no schema or RLS change.

## Decisions (from the grilling, owner approved)

1. **24 a page, columns 2 → 3 (`sm`) → 4 (`md`, `lg`) → 6 (`xl`).** 24 divides by every step. The 1200px cap, gaps and eager count (6) stay.
2. **`sizes`** by the AC-4 rule: `(min-width: 1280px) 187px, (min-width: 1232px) 288px, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw`.
3. **All `catalog` grids**: See all list pages, `/search` (browse, search, discover), every library tab, their skeletons, `/showcase`. The season grid (`wide`) is unchanged.
4. **TMDB window.** Page *p* shows TMDB results `(p-1)×24+1` to `p×24`, which always span exactly two TMDB pages, read in parallel through the existing cached reads, so neighbours share one cache entry. A TMDB page past 500 is never requested.
5. **Last page** `ceil(min(total_results, min(total_pages, 500) × 20) / 24)`: page 417 of a 10,000 result list shows 16 titles.
6. **One failed half fails the page**: the existing error panel with Retry.
7. **A title on both TMDB pages appears once** (deduplicated by id inside the window, which can leave that page one short; React keys need it).
8. **Filtered search stays as is**: cursor based, `SCAN_TARGET = 20`, variable card count. Named exception.
9. **Short rows accepted** on a last page, filtered search, a library page after an in place removal, a deduplicated page, the season grid.
10. **No redirects** for old `?page=N` links; past the new last page they show the existing "That page doesn't exist" panel.
11. **The home rows keep TMDB page 1** (`readCatalogList` is unchanged); only the See all pages use the window.

## Design

- **`lib/catalog/grid-page.ts`** (new, pure, no `server-only`): `GRID_PAGE_SIZE = 24`; `TMDB_PAGE_SIZE = 20` moves here from `lib/search/constants.ts` (which re-exports it, so `scan.ts` is untouched); `gridPageWindow(page)` → `{ tmdbPages: number[], skip }` with pages above `TMDB_MAX_PAGE` dropped; `lastGridPage(totalResults, totalPages)`; `combineGridPage(page, tmdbPages: Paged<T>[])` → `Paged<T>` (concatenate, deduplicate by id, skip, take 24, `totalPages` = `lastGridPage`, `totalResults` from the first read). Unit tested.
- **`readGridPage(page, readTmdbPage)`** (in the same module, generic over the read function): `Promise.all` over the window, then `combineGridPage`. A rejection propagates as the `TmdbError` it already is.
- **Catalog**: `readCatalogGridPage(list, page)` and a tagged twin in `lib/catalog-list-read.ts`, used by `CatalogListPage` and `catalogListMetadata`. `readCatalogList` stays for the home rows.
- **Search**: `search` and `browse`/`discover` modes read through `readGridPage` over `readSearchPage` and `readDiscoverPage`. `FilteredResults` is untouched.
- **Pages**: callers use the combined `totalPages` (already capped), so `lastReachablePage` is no longer applied on top of it in those two places. `parsePageParam` keeps its 1–500 range.
- **Grid**: the `catalog` classes become `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6`, with the new `sizes`; the JSDoc drops "short last row accepted". `COLUMNS_AT` in the test follows.
- **Skeletons**: both 20 card skeletons use `GRID_PAGE_SIZE`; `LibrarySkeleton` visibility becomes `["", "", "hidden sm:block", "hidden md:block", "hidden xl:block", "hidden xl:block"]`.
- **Library**: `LIBRARY_PAGE_SIZE = 24`. `fetchMoviesByIds` already batches 8 at a time, so 24 is three batches.

## Expected files

- New: `lib/catalog/grid-page.ts`, `lib/catalog/grid-page.test.ts`
- `components/poster-grid.tsx`, `components/poster-grid.test.tsx`, `components/poster-card.tsx` (sizes comment only, if it names columns)
- `lib/catalog-list-read.ts`, `components/catalog/catalog-list-page.tsx`, `lib/landing-metadata.ts` (+ tests)
- `lib/search/read.ts`, `lib/search/constants.ts`, `components/search/search-results.tsx` (+ tests)
- `lib/tracking/library-lists.ts`, `lib/tracking/library-lists.test.ts`, `components/library/library-panels.tsx` (+ skeleton test)
- Docs: spec 0022 (done with this plan), one line amendment notes in specs 0006, 0008, 0009, 0020, 0021 where they say 20; `components/AGENTS.md` grid description (via `/sync` after the build)

## Requirements and acceptance criteria

- At 375, 640, 768, 1024 and 1280px+ a full page of `/movies/popular`, `/shows/top-rated`, `/search?type=movie` (browse), `/search?q=star` and a library tab with 24+ titles has no empty slot in its last row.
- Page 2 of a list starts with TMDB result 25 and has no title from page 1 (unless TMDB itself re-ranked between reads).
- The pagination count matches `lastGridPage`; `?page=` past it shows "That page doesn't exist"; page 417 of a capped list renders.
- Filtered search (`/search?q=star&genre=…`) behaves exactly as before.
- A failed TMDB read on either half shows the error panel with Retry.
- The home rows still show TMDB page 1 (12 cards), unchanged.
- The season grid is unchanged.
- No horizontal scroll, 44px tap targets kept, eager first row of 6.

## Security

Public catalog data only. No new request state enters a cached scope: the window function takes only the page number, and each TMDB read keeps its existing cache key. No auth, RLS or schema change; the library change only resizes an owner scoped slice and range.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (new `grid-page.test.ts`: window at pages 1, 2, 5, 417; skip values 0/4/8/12/16; TMDB page 501 dropped; dedupe; last page maths incl. empty list and the 10,000 cap; the updated `poster-grid.test.tsx` sizes invariant; `LIBRARY_PAGE_SIZE` is 24), `pnpm build` (route table unchanged).

## Manual test

1. `pnpm dev:docker`, open `/movies/popular` at 1440px: 4 full rows of 6. Resize to 1100px (6 rows of 4), 700px (8 rows of 3), 375px (12 rows of 2): no gaps.
2. Note the last card on page 1, open page 2: its first card is the next title, and the pagination last page matches the count.
3. Open `/movies/popular?page=417`: up to 16 cards; `?page=418` shows "That page doesn't exist".
4. `/search?type=tv` and `/search?type=movie&q=star`: 24 cards, full rows; pages 2 and 3 work.
5. `/search?type=movie&q=star&rating=7`: same behaviour as before (variable count, "More results" cursor).
6. Signed in with 25+ planned movies, `/watchlist?type=movie`: 24 cards on page 1, the rest on page 2. Remove one card: the row shortens in place (accepted).
7. `/shows` and `/movies` landings: rows unchanged. A show page: season grid unchanged.
8. View source of `/movies/popular?page=2`: the canonical is `?page=2`; `?page=500` is `noindex`.
