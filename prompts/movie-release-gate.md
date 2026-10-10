# Movies cannot be watched or rated before release

No spec: a two action, one component change that reuses `airStatus` (decided in grilling, 2026-10-10). The rule lands in `AGENTS.md` sections 7 and 13. Branch `feat/movie-release-gate`.

## Goal

A movie that is not out yet can only be planned. Marking it watched and giving it a score both wait for its TMDB release date, the same way an episode waits for its air date. Anything already stored stays and can still be removed.

## Inspected code

- `app/movies/actions.ts`: `runTrackingWrite(event, movieId, creates, write)` already calls `loadMovie` for every creating write (`setMovieWatchlist(true)`, `setMovieWatched(true)`, `setMovieRating(n)`), so the release date is in hand at no extra cost. The removals and the two Undo restores skip TMDB.
- `app/shows/actions.ts:170-193`: `confirmEpisode` refuses `airStatus === "upcoming"` with `not_aired`; `setEpisodeRating` runs the same check for any non-null score, including a re-score.
- `lib/tv/air-status.ts`: `airStatus(date, today)` returns `aired | upcoming | unknown`; `todayUtc(now)` is the UTC day. `lib/tracking/episode-state.ts:82` has `requestTodayUtc`, the once per request read.
- `lib/catalog/movie-page.ts`: `classifyMovie` places a planned movie on Watchlist only when `airStatus(releaseDate) === "aired"`. The new gate uses the same test, so a movie is markable exactly when it sits on Watchlist.
- `components/tracking/movie-tracking-slot.tsx` and `movie-tracking-controls.tsx`: the movie page's Plan, Mark watched and Your score pills. They have no Undo.
- `components/tracking/episode-tracking-slot.tsx` and `episode-tracking-controls.tsx`: the precedent. With no stored state an upcoming episode shows "Upcoming" text. With state, the Watched pill can only unmark (`aria-disabled`, `PILL_UNAVAILABLE`), and `ScorePicker`'s `unavailableNote` disables the ten scores but keeps Clear rating.
- `components/library/library-grid.tsx:184`: the library grid only calls `setMovieWatched(id, false)` and `setMovieWatchlist(id, false)`; the card bookmark only plans. Neither needs a change.
- `lib/tracking/types.ts`, `messages.ts`: `MovieTrackingError` feeds `TRACKING_MESSAGES`; `EpisodeTrackingError = MovieTrackingError | "not_aired"` and `ShowTrackingError = MovieTrackingError`.
- `lib/format.ts`: `formatAirDate` ("Oct 24, 2026", UTC).

## Skills

`next-dev-loop`, to check the movie page in the running app. No database skill: nothing in Postgres changes.

## Decisions (settled in grilling, 2026-10-10)

1. **Released** means `airStatus(movie.releaseDate, todayUtc) === "aired"`: TMDB's primary `release_date`, compared with the UTC day.
   - A future date blocks.
   - No date, or a malformed one, also blocks. This differs from episodes on purpose: a dateless movie is almost always announced or in production, and the Upcoming page already treats it as not out.
   - TMDB's production `status` is ignored.
2. **Blocked before release:** `setMovieWatched(id, true)` and `setMovieRating(id, n)` for any `n`, including changing an existing score.
3. **Always allowed:** planning and unplanning, unmarking, clearing a score, `restoreMovieWatchlist` and `restoreMovieWatched`. A restore only puts back what was already stored.
4. **Existing state is kept:** a movie marked or rated before release (older data, or a date TMDB later pushed back) keeps both.
5. **Enforced in the Server Action and the UI**, not in the database: Postgres does not know TMDB dates, and the catalog is never cached there.
6. **New error `not_released`**, with the toast "This movie hasn't been released yet." It is a movie only error, so the episode and show unions exclude it.
7. **Movie page with no watched mark and no score, before release:** the Plan pill stays. The Mark watched and Your score pills are replaced by a line: "Releases Oct 24, 2026", or "Release date TBA" when there is no real date.
8. **Movie page with a watched mark or a score, before release:** the controls mirror the episode ones. Watched works only to unmark. The score picker shows the stored score and Clear rating, with the ten choices disabled under the same release line. Once the last of that state is removed, the controls switch to the line from decision 7 at once (they read the optimistic state), which is what the server renders after `refresh()` anyway.

## Expected files

- `lib/catalog/movie-page.ts`: add `isMovieReleased(releaseDate, today)` and `movieReleaseNote(releaseDate)` ("Releases Oct 24, 2026" or "Release date TBA"), pure, beside `classifyMovie`, which switches to `isMovieReleased` so the two can never disagree.
- `lib/tracking/types.ts`: the shared classes move to a new base `TrackingError`. `MovieTrackingError = TrackingError | "not_released"`, `EpisodeTrackingError = TrackingError | "not_aired"` and `ShowTrackingError = TrackingError`, so neither episodes nor shows carry a movie refusal. (As built: `classifyTrackingError` and the show actions' `Outcome` now name `TrackingError`; an `Exclude<…>` form was tried first but left the show actions mistyped.)
- `lib/tracking/messages.ts`: `not_released: "This movie hasn't been released yet."` in `TRACKING_MESSAGES`. `EPISODE_TRACKING_MESSAGES` spreads it and leaves the extra key out.
- `app/movies/actions.ts`: `runTrackingWrite`'s `creates: boolean` becomes `check: "none" | "exists" | "released"`. `"released"` runs the `loadMovie` check and then refuses with `not_released` when `!isMovieReleased(movie.releaseDate, todayUtc(new Date()))`, logging the event. `setMovieWatchlist(true)` uses `"exists"`; `setMovieWatched(true)` and a non-null `setMovieRating` use `"released"`; removals and restores use `"none"`.
- `lib/tracking/log.ts`, only if its outcome union is closed, to accept `not_released`.
- `components/tracking/movie-tracking-slot.tsx`: takes `releaseDate` and works out `released` with `requestTodayUtc()`. It passes `released` and the release note down.
- `components/tracking/movie-tracking-controls.tsx`: new props `released: boolean` and `releaseNote: string`. When unreleased:
  - with no watched mark and no score, it renders Plan and the release line;
  - otherwise the Watched pill is `aria-disabled` unless watched (`PILL_UNAVAILABLE`, and the click is a no-op), and `ScorePicker` gets `unavailableNote={releaseNote}`.
- `app/movies/[id]/page.tsx`: passes `movie.releaseDate` to the slot.
- `AGENTS.md`: section 7 says "Movies can be marked watched and rated directly from 1 to 10 from their TMDB release date; before it, or with no date, they can only be planned." Section 13 gains item 16: "An unreleased or undated movie can be planned but not marked watched or rated; existing marks and scores stay removable."
- Tests: `lib/catalog/movie-page.test.ts`, `app/movies/actions.test.ts`, `components/tracking/movie-tracking-controls.test.tsx`.

## Requirements

- R1. `setMovieWatched(id, true)` returns `{ ok: false, error: "not_released" }` and writes nothing when the release date is after today (UTC), missing or malformed.
- R2. `setMovieRating(id, n)` does the same for every `n` from 1 to 10, whether or not a score is stored.
- R3. `setMovieWatched(id, false)`, `setMovieRating(id, null)`, `setMovieWatchlist(id, true or false)` and both restores behave exactly as before for an unreleased movie.
- R4. On the release day (UTC) and later, nothing changes from today's behaviour.
- R5. The movie page shows the states from decisions 7 and 8. A visitor still sees no controls.
- R6. Only the server decides: the UI gate is a convenience, and a crafted call to the action is still refused.

## Date boundary

UTC calendar day, as for episodes (spec 0011). A movie becomes markable at 00:00 UTC on TMDB's `release_date`. The cost is that an evening release west of UTC is markable a few hours early, which is already accepted for episodes.

## Security

- No new input: the date comes from the server side `loadMovie` read, never from the client.
- `user_id` still comes only from the verified session, and RLS is unchanged.
- A crafted action call is refused (R6). Pre-release rows cannot be rejected by the database, which is accepted (decision 5).

## Acceptance criteria

- AC-1. An unreleased movie with no stored state shows Plan plus "Releases {date}" or "Release date TBA", and no Mark watched or Your score pill.
- AC-2. An unreleased movie that is watched or scored shows the pills. Unmark and Clear rating work; Mark watched and the ten scores are disabled under the release line.
- AC-3. The actions refuse a new mark or score before release with `not_released` and the toast copy, and the optimistic state rolls back.
- AC-4. Removals, planning and both Undo restores still work for an unreleased movie.
- AC-5. Released movies behave exactly as before.
- AC-6. `classifyMovie` and the gate agree: a planned movie is markable exactly when it is on Watchlist.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (server code and a page change). No `pnpm test:db`, since no schema changes.

## Manual test steps

Run `pnpm dev:docker` and sign in.

1. Open an unreleased movie: on `/movies`, set the year filter to next year, or open a known future title. You see Plan and "Releases {date}", with no Mark watched or score pill. Click Plan: the movie appears on `/upcoming?type=movie`.
2. Open a movie TMDB lists with no release date. The line says "Release date TBA".
3. Open a released movie (`/movies/550`). All three pills work as before.
4. Pre-release state: in local Studio, set `watched_at = now(), rating = 7` on your `user_movie_state` row for the unreleased movie from step 1, then reload the page. Watched shows pressed and the score shows 7. The score popover shows the release line, the ten choices are disabled, and Clear rating works. After Clear, unmarking Watched leaves Plan and the release line.
5. Crafted call: with the movie unmarked, run the Server Action from step 4 again with stale page state (keep a second tab open from before step 4's Clear and click Mark watched there). The toast says "This movie hasn't been released yet." and the pill rolls back.
6. On `/watched?type=movie`, remove the movie from step 4 (re-seed it first) and press Undo. It comes back.
7. Mobile width (390px): the release line wraps cleanly beside the Plan pill.
