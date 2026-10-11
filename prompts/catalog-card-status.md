# Catalog cards show the title's real status

No spec: it reuses the library pages' card states and classifiers, with no new architectural decision (decided in grilling, 2026-10-11). Branch `feat/catalog-card-status`, off `main`.

## Goal

A poster card on `/movies`, `/shows` and `/search` shows the signed-in user's actual state for that title, the same state its library page shows. Today a watched and scored movie still shows the TMDB rating and an empty Plan bookmark there.

## Inspected code

- `app/movies/page.tsx`, `app/shows/page.tsx` and `components/search/search-results.tsx` render `PosterCard` with a static `TmdbRatingBadge`. They put the bookmark in `controls` inside its own `Suspense fallback={null}`. Search also passes `meta={year}`.
- `components/tracking/card-bookmark.tsx` reads only `getWatchlistedMovieIds` (a `cache()`d read, one query per grid). `CardBookmarkButton` can only plan or unplan.
- `components/tracking/show-card-bookmark.tsx` reads only `getTrackedShows`.
- `components/library/library-card.tsx` holds the movie cards:
  - Watchlist: TMDB badge and the Planned button.
  - Upcoming: `ReleasePill` (`DatedPill` or `DateTbaPill`), no badge, and the Planned button.
  - Watched: `PersonalScoreBadge` when scored, and a filled `WatchedIcon` button labelled "Unmark … as watched".
- `components/library/show-cards.tsx` holds the show cards. `UpcomingShowPill` shows "S2E1 · Oct 20" or Date TBA. `WatchedShowCard` shows `CalculatedRatingBadge` ("Your show rating") and puts `WATCHED_SHOW_LABELS` in `meta`.
- `lib/catalog/movie-page.ts` provides the pure helpers `classifyMovie` and `upcomingReleaseDate`.
- `lib/tv/library-page.ts` provides the pure `classifyShow(details, watchedRegularKeys, today)`, which returns `ShowPage`.
- `lib/tracking/library-lists.ts` has two things to reuse:
  - The private `readWatchedRegular`, which pages through the watched regular episodes.
  - `getTvShowsSettled`, a cached TMDB details batch.
- `lib/tracking/show-ratings.ts`: `getShowRatings(userId, ids)`.
- `lib/tracking/episode-state.ts`: `requestTodayUtc()`.
- `app/movies/actions.ts` and `app/shows/actions.ts` already call `refresh()` on success, so after any write the server re-renders a card's badge and pill. No client-side badge state is needed.
- `components/tracking/use-movie-cleared-undo.ts` provides `showCleared("unwatched", cleared, …)`, the unmark toast and Undo the movie page uses.
- `lib/search/read.ts`: `SearchResult` has `year` but no `releaseDate`. `MovieSummary.releaseDate` exists.

## Skills

- `next-dev-loop`, to drive the three grids in the running app.
- `supabase` only for the local stack (`pnpm dev:docker`). There is no schema change, so the Postgres skill is not needed.

## Decisions (settled in grilling, 2026-10-11)

1. **Scope:** the poster grids on `/movies`, `/shows` and `/search` (both media types). Quick search rows, detail pages and the library pages themselves are unchanged.
2. **Watched movie:** your cyan score replaces the TMDB rating. With no score, the TMDB rating stays.
3. **The watched movie's button** is the filled watched mark from the Watched page.
   - It unmarks the movie with `setMovieWatched(id, false)`, which also removes the score.
   - The toast and Undo are the movie page's (`useMovieClearedUndo`, `"unwatched"`).
   - After `refresh()`, the card falls back to the empty Plan bookmark and the TMDB rating.
4. **Planned movie, released:** unchanged (TMDB badge and Planned bookmark), as on Watchlist.
5. **Planned movie, unreleased or undated:** the Upcoming look, with the release date pill or Date TBA, no badge, and the Planned bookmark. The date comes from the TMDB result already on the card. The test is `classifyMovie` with `requestTodayUtc()`, so the card and `/upcoming` cannot disagree.
6. **Untouched title:** unchanged.
7. **Tracked show:** the filled bookmark (Stop tracking) stays on every tracked card. What else the card shows comes from `classifyShow`:
   - **Watchlist:** nothing extra. The card is the same as today.
   - **Upcoming:** the "S2E1 · Oct 20" pill or Date TBA bottom left, and no TMDB rating.
   - **Watched:** `CalculatedRatingBadge` replaces the TMDB rating when a regular season is rated; with no rating the TMDB rating stays. The Finished or Caught up label goes under the name.
8. **While status loads:** the badge falls back to the TMDB rating, so only your own titles swap. The controls fall back to nothing, as today. The meta line falls back to what it shows today (the year on `/search`, nothing on `/shows`).
9. **Failure:** if the user-state read fails, the card renders exactly as it does for a visitor, as `CardBookmark` does today. If one tracked show's TMDB details or the ratings read fail, that card stays a plain tracked card (bookmark and TMDB rating) and is never labelled wrongly.
10. **Search meta (assumption):** a Watched show on `/search` reads "2019 · Finished", appending the label to the year rather than replacing it.

## Design

One request-scoped read per grid and media type, shared by every card through React `cache()` with a string key, the `getWatchlistedMovieIds` pattern. Each card fills three slots, each in its own Suspense boundary: badge, meta (shows only) and controls. All three call the same cached read, so a grid still makes one Supabase round per media type.

- `lib/tracking/movie-state.ts`:
  - `getWatchlistedMovieIds` is replaced by `getMovieGridStates(idsKey)`, which returns `Map<movieId, { inWatchlist, watched, watchedAt, rating }>` from one `in()` query.
  - The pure `movieCardStatus(state | undefined, releaseDate, today)` returns `"none" | "watchlist" | "upcoming" | "watched"` through `classifyMovie`, with `"upcoming"` carrying `upcomingReleaseDate`.
- `lib/tracking/show-grid-status.ts` (new, server-only) provides `getShowGridStatus(idsKey)`:
  1. `getTrackedShows`.
  2. For the tracked ids only: the watched regular episodes (`readWatchedRegular`, exported from `library-lists.ts`), `getTvShowsSettled`, then `classifyShow` per show.
  3. `getShowRatings` for the shows that land on Watched.

  It returns `Map<showId, ShowPage & { rating }>`. A show whose own reads failed is just tracked.
- `components/tracking/movie-card-slots.tsx` provides `MovieCardBadge` and `MovieCardControls`. The controls render one of three things:
  - `CardBookmarkButton`
  - the release pill plus `CardBookmarkButton`
  - the new `CardWatchedButton`
- `components/tracking/card-watched-button.tsx` (new client component): the round filled watched mark, which calls `setMovieWatched(id, false)`. It uses the same optimistic, error toast and `useMovieClearedUndo` handling as `CardBookmarkButton`.
- `components/tracking/show-card-slots.tsx` provides `ShowCardBadge`, `ShowCardMeta` and `ShowCardControls` (the Upcoming pill plus `ShowCardBookmarkButton`).
- `ReleasePill` (from `library-card.tsx`) and `UpcomingShowPill` (from `show-cards.tsx`) are exported and reused unchanged, so the pill copy and layout have one owner.
- `card-bookmark.tsx` and `show-card-bookmark.tsx` are replaced by the slot components, and their callers are updated.

## Expected files

- Changed:
  - `app/movies/page.tsx`
  - `app/shows/page.tsx`
  - `components/search/search-results.tsx`
  - `lib/search/read.ts` (adds `releaseDate` to `SearchResult`, movies only, null for TV)
  - `lib/tracking/movie-state.ts`
  - `lib/tracking/library-lists.ts` (exports `readWatchedRegular`)
  - `components/library/library-card.tsx` and `components/library/show-cards.tsx` (export the pills)
- New:
  - `lib/tracking/show-grid-status.ts`
  - `components/tracking/movie-card-slots.tsx`
  - `components/tracking/show-card-slots.tsx`
  - `components/tracking/card-watched-button.tsx`
- Removed: `components/tracking/card-bookmark.tsx` and `components/tracking/show-card-bookmark.tsx` (their tests move to the slot files).
- Tests:
  - `lib/tracking/movie-state.test.ts` (`movieCardStatus`)
  - `lib/tracking/show-grid-status.test.ts`
  - `components/tracking/movie-card-slots.test.tsx`
  - `components/tracking/show-card-slots.test.tsx`
  - `components/tracking/card-watched-button.test.tsx`
  - updates to `search-results` and the page tests

## Requirements

- R1. A watched, scored movie on any grid shows `PersonalScoreBadge` and the filled watched button, and no Plan bookmark.
- R2. A watched, unscored movie shows the TMDB badge and the filled watched button.
- R3. Tapping the watched button unmarks the movie. A stored score shows the "score removed" toast with Undo, and Undo restores the mark and the score. Afterwards the card shows the TMDB badge and the empty Plan bookmark.
- R4. A planned, unreleased or undated movie shows the release pill or Date TBA, no badge, and the pressed Planned bookmark. A planned, released movie looks as it does today.
- R5. A tracked show on Upcoming shows its pill and no badge. On Watched it shows the calculated rating, or the TMDB rating if unrated, plus the Finished or Caught up label. On Watchlist it looks as it does today. Every tracked show keeps the filled bookmark.
- R6. A card's status always matches the library page that title is on, because both use the same classifiers and the same `requestTodayUtc()`.
- R7. Signed-out visitors, and any failed read, get today's catalog card. Nothing breaks the grid.
- R8. A grid makes one movie-state query or one tracked-show pass per request, whatever the card count. TMDB details are read only for tracked shows on the grid (at most 20, cached).

## Security

- Every new read derives the user from `getOptionalUser()`, filters on `user_id` explicitly and through RLS, and never runs inside `use cache` (`AGENTS.md` section 11).
- The grids' prerendered shells stay public. All user state streams inside per-card Suspense boundaries, so private state never enters a shared cache.
- The unmark goes through the existing `setMovieWatched` Server Action, which already authenticates and validates.
- `releaseDate` on `SearchResult` is public TMDB data.

## Acceptance criteria

- AC-1. R1 to R7 hold on `/movies`, `/shows`, `/search?type=movie` and `/search?type=tv`.
- AC-2. `/movies` and `/shows` still prerender their shells (`pnpm build` reports them as partially prerendered, as now).
- AC-3. Unchanged cards show no layout shift: the badge fallback is the TMDB badge.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. No `pnpm test:db`: there is no database change.

## Manual test steps (`pnpm dev:docker`, signed in)

1. Mark a released movie watched with score 8. On `/movies` (or `/search?type=movie&q=<title>`), its card shows the cyan 8 and the filled watched mark.
2. Tap the watched mark. The toast offers Undo, and the card shows the TMDB rating and the empty Plan bookmark. Tap Undo, and the cyan 8 and watched mark return.
3. Mark another movie watched without a score. Its card shows the TMDB rating and the watched mark.
4. Plan an unreleased movie (find one in search). Its card switches to the release date pill with no badge, and it matches its `/upcoming?type=movie` card.
5. On `/shows` or `/search?type=tv`, track three shows:
   - one with an unwatched aired episode, which looks as it does today;
   - one caught up with a dated next episode, which shows the S·E date pill and no rating;
   - one ended show fully watched and rated, which shows your show rating and "Finished".

   Each must match its library page.
6. Stop tracking the Watched show from its card. The card returns to the TMDB rating with an empty bookmark.
7. Sign out. All grids look as they did before this change.
8. Narrow the window to phone width. The pills and badges don't overlap, and the tap targets stay 44px.
