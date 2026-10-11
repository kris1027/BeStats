# Four column grid, cyan selected tabs, footer icon key, honest skeletons

## Goal

Four UI changes, settled with the user in a grilling session on 2026-10-11:

1. Stop the layout jumping when a page finishes loading: every skeleton matches the footprint of what replaces it.
2. Regrid the poster grids to at most 4 columns, so the 20 cards a page holds fill 5 complete rows.
3. Light the selected navbar tab in the personal score cyan, as a glass fill.
4. Replace the per tab badge legend with one fixed icon key, centred at the top of the site footer on every route.

Branch `feat/grid-tabs-footer-legend`. No spec: this plan records the decisions.

## Inspected code

- Grid: `components/poster-grid.tsx` (2/3/4/5/6 columns), `components/poster-card.tsx` (`POSTER_SIZES`), `app/shows/page.tsx` and `app/movies/page.tsx` (`PAGE_SIZE = 20`, `EAGER_POSTERS = 6`, skeletons), `components/library/library-grid.tsx` (`EAGER_POSTERS`), `components/show/season-grid.tsx` (also `PosterGrid`), `lib/tracking/library-lists.ts` (`LIBRARY_PAGE_SIZE = 20`)
- Skeletons: `components/library/library-panels.tsx` (`LibrarySkeleton`, always 20 cards), `components/search/search-results.tsx` (`SearchResultsSkeleton`), `components/skeleton.tsx`, `components/movie/movie-detail-skeleton.tsx`, `components/show/show-detail-skeleton.tsx`, `components/show/season-skeleton.tsx`, `components/catalog/detail-skeletons.tsx`
- Tabs: `components/layout/media-type-tabs.tsx`, `components/layout/library-nav.tsx` (bar and sheet variants), `glass-selected` in `app/globals.css`, `--color-score-personal: #50c6e5`
- Legend: `components/library/badge-legend.tsx`, its callers `show-library-tab.tsx` and `movie-library-tab.tsx`, `components/library/library-section.test.tsx` (legend cases), `components/tracking/tracking-icons.tsx` (no `"use client"`, so usable from the server footer), `components/AGENTS.md` (badge legend line), `app/showcase/page.tsx`
- Footer: `components/layout/site-footer.tsx`, `site-footer.test.tsx`, `app/layout.tsx`, `app/layout-purity.test.ts` (the footer must stay a request free Server Component)

## Skills used

`next-dev-loop` to measure skeletons against loaded pages and verify the result in the running app. No database change, so no Supabase skill.

## Decisions

1. **Page size stays 20 everywhere.** `/shows`, `/movies` and `/search` keep one TMDB page per BeStats page; the library pages keep `LIBRARY_PAGE_SIZE = 20`. No TMDB re-paging.
2. **Grid columns: 2 below `md`, 4 from `md` (768px).** 20 fills every row at both counts (10 × 2, 5 × 4); 3 columns would leave a partial row, so there is no 3 column step. Applies to every `PosterGrid`, including the seasons on `/shows/{id}`.
3. **Grid width capped at 1200px and centred** on every page (`mx-auto max-w-[1200px]` on `PosterGrid`; changed from left aligned at the owner's request after review), so a 4 column poster stays near 285px wide and a 5 row page stays a sensible length. Pagination and other content beside the grid keep their current width.
4. **Image sizes follow the grid.** `POSTER_SIZES` becomes `(min-width: 1200px) 300px, (min-width: 768px) 25vw, 50vw`; every `EAGER_POSTERS` becomes 4 (one full row at the widest grid).
5. **Skeletons.**
   - `LibrarySkeleton` draws one row (4 cards): the real count is unknown until the read, and one row is the smallest honest guess.
   - The `/shows`, `/movies` and search skeletons add a placeholder for the pagination row at its real height.
   - Every other route (detail, season, search filters, auth, account) is measured in the browser: skeleton height against loaded height at 390px and 1440px. Any mismatch over a few pixels is fixed in its skeleton; the plan's report lists each route measured and what changed.
6. **Selected tab: cyan glass.** A new `glass-selected-personal` utility in `app/globals.css`, the same layer stack as `glass-selected` (fill, plate, rim on the 1.5px border) with the gradient tinted from `--color-score-personal`, translucent so the glass reads. Text on it is near black (a token, e.g. `text-on-personal`) so it meets WCAG AA 4.5:1; the exact tint is checked with a contrast measurement, not assumed. Used by the selected tab in `MediaTypeTabsView` and in both `LibraryNav` variants. Unselected tabs do not change.
7. **Footer icon key.**
   - `BadgeLegend` and its per tab entries are deleted, with their test cases; the two library tabs no longer render it.
   - A new `IconKey` Server Component (`components/layout/icon-key.tsx`) renders one fixed list, always all entries, in this order: TMDB rating, Your score, Plan, Planned, Next episode, Mark watched, Release date. Same icons and colours as the cards (`StarIcon` in `rating-tmdb` / `score-personal`, `PlanIcon`, `PlannedIcon`, `NextEpisodeIcon`, `WatchedIcon` outline, `CalendarIcon`), `size-4`, `text-text-legend`.
   - It is the footer's first row, on every route, inside the footer's 1600px container: a hairline (`border-t border-border`) above, centred `flex-wrap` with the current legend gaps, wrapping centred on mobile. The existing attribution and legal row sits below it unchanged.
   - `<ul aria-label="Icon key">`, each `<li>` the icon (`aria-hidden`) and its text.
   - It reads no request state, so the footer stays in every prerendered shell.
8. **Docs.** `components/AGENTS.md` badge legend line now points at the footer icon key; the showcase's legend wording is updated to match.

## Expected files

- `components/poster-grid.tsx`, `components/poster-card.tsx`
- `app/shows/page.tsx`, `app/movies/page.tsx`, `components/library/library-grid.tsx`, `components/library/show-library-tab.tsx`, `components/library/movie-library-tab.tsx` (eager count, legend removal)
- `components/library/library-panels.tsx`, `components/search/search-results.tsx`, plus any detail or season skeleton the measurement flags
- `app/globals.css`, `components/layout/media-type-tabs.tsx`, `components/layout/library-nav.tsx`
- New `components/layout/icon-key.tsx` and `icon-key.test.tsx`; `components/layout/site-footer.tsx` and its test
- Deleted `components/library/badge-legend.tsx`; `components/library/library-section.test.tsx` legend cases removed
- `components/AGENTS.md`, `app/showcase/page.tsx`
- Tests touching the grid, tabs or skeleton counts, updated

## Requirements

- No horizontal scroll at 390px; tap targets keep their current sizes (the tab `hit-area` utilities are unchanged).
- The selected tab keeps `aria-current="page"`; colour is not the only signal.
- No colour literal outside `app/globals.css` (`design-tokens-boundary.test.ts`).
- Footer stays a Server Component with no cookie, header or session read (`layout-purity.test.ts`).
- `POSTER_SIZES` and the grid columns change together (the comment in `poster-grid.tsx`).

## Security

UI only: no new data, input, route or credential. The footer key is static, so it is safe in shared prerendered shells.

## Acceptance criteria

1. At 1440px, `/shows`, `/movies`, `/search` and a 20 title library page show 5 full rows of 4; at 390px, 2 columns.
2. The grid is no wider than 1200px and is centred on every page.
3. Loading each route shows a skeleton whose height matches the loaded page; a library page with 3 titles no longer collapses from 5 rows to 1.
4. The selected SHOWS | MOVIES tab and the selected Watchlist / Upcoming / Watched link are cyan glass with near black text at 4.5:1 or better; unselected tabs look as before.
5. No library page renders a legend under its grid.
6. Every route, including `/sign-in`, `/account`, `/privacy` and a 404, shows the icon key centred at the top of the footer, with all seven entries.
7. The showcase and `components/AGENTS.md` describe the new key.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps (`pnpm dev:docker`)

1. Open `/shows` at 1440px: 4 columns, 5 full rows, grid at most 1200px wide and centred, pagination below. Resize to 390px: 2 columns, no horizontal scroll.
2. Throttle the network (DevTools, Slow 4G) and open `/shows?page=2`: the skeleton grid and pagination placeholder hold the page height; nothing jumps when cards arrive.
3. Sign in with an account tracking 3 shows, open `/watchlist`: the skeleton is one row, and the page does not shrink when the cards load.
4. Open `/shows/1399` and a season page with throttling: no visible resize when content arrives; seasons are 4 per row.
5. Check the navbar on `/shows`, `/movies?page=2`, `/watchlist?type=movie`: the lit tab is cyan glass with dark text; keyboard Tab shows the focus ring on it.
6. Scroll to the footer on `/shows`, `/sign-in`, `/privacy` and `/nope`: the icon key is the footer's centred first row with all seven entries; at 390px it wraps centred.
7. Open `/showcase`: the tab and key examples match the shipped UI.
