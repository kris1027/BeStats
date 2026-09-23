# Verify: movie tracking · spec 0007 · updated 2026-09-23
_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run against the local stack with `pnpm dev:docker`, which starts the stack if needed and puts its keys over the cloud ones in `.env.local`. Seed users (after `pnpm exec supabase db reset`): `user-a@example.test` / `password-a`, `user-b@example.test` / `password-b`. Inspect rows with `docker exec supabase_db_BeStats psql -U postgres -c "select * from user_movie_state where movie_id = 550"`.

## UI / manual
- [x] Signed out, open `/movies/550` and `/movies` → no tracking row, no card bookmarks, no skeleton, no console error → AC-2
- [x] Sign in as user A, open `/movies/550` → one row under the TMDB block: Plan, Mark watched, Not rated, in that order; names "Plan Fight Club" and "Mark Fight Club watched" with `aria-pressed`; no flash of a default state on reload → AC-1
- [x] Click Plan → reads Planned with the green bookmark at once; row has `in_watchlist = true`; reload keeps it → AC-3
- [x] In a second browser (or a private window) signed in as user A, open `/movies/550` → same state → AC-3
- [x] Click Mark watched on a planned, unwatched movie → Watched, and Plan clears; row has `watched_at` set, `in_watchlist = false` → AC-4
- [x] Set `watched_at` to a past date in psql, click Plan (rewatch), then in a stale second tab click Mark watched → date and bookmark both unchanged → AC-4, AC-6
- [x] Rate 8, then click Watched to unwatch → `watched_at` null, `rating = 8`, bookmark unchanged, no confirm → AC-5
- [x] Open the score pill → popover "Your score", two rows of five, focus on the checked (or first) choice. Arrow keys move focus only (row check: nothing written), Up and Down jump five, Enter saves and closes, focus returns to the pill; Escape closes without saving → AC-7
- [x] On an unwatched, planned movie pick 7 → row: `rating = 7`, `watched_at` set, `in_watchlist = false`; pick 8 on the now watched movie → only `rating` changes → AC-8
- [x] Clear rating → pill reads Not rated; `watched_at` and `in_watchlist` untouched → AC-9
- [x] The score shows `8`, never `8.0`, in the cyan style; the TMDB badge stays amber with its TMDB label → AC-10
- [x] With DevTools set to Offline, click a pill → it flips, then returns, and the toast reads "Couldn't save that change. Try again."; no error page → AC-11
- [x] Delete the `sb-127-auth-token` cookie, click Plan → rolls back, toast "Your session expired. Sign in to save this." with Sign in; the action opens `/sign-in?next=%2Fmovies%2F550`; nothing written → AC-12
- [x] Block `api.themoviedb.org` (for example in DevTools request blocking, after the cached entry expires or on a cold cache), click Plan on an unplanned movie → toast "Couldn't reach TMDB. Try again in a moment.", nothing written; unplan a planned movie while still blocked → succeeds → AC-14
- [x] Double click Plan, and pick 7 then 8 quickly → stored row equals the last click; still one row → AC-15
- [x] On `/movies` signed in, every card shows the round bookmark bottom right; clicking toggles it without opening the movie; 44px target at 375px, 36px on desktop → AC-16
- [x] With the app on a production build (`pnpm build && pnpm start`, with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to the local values from `pnpm exec supabase status` for both commands), load `/movies` once and count requests in `docker logs --since <time> supabase_kong_BeStats | grep user_movie_state` → exactly one. (`next dev` shows two, from its extra dev render.) → AC-16
- [x] `docker stop supabase_rest_BeStats`, reload `/movies/550` → "Couldn't load your tracking." with Try again, catalog intact; `/movies` shows no bookmarks; the server log has `movie_tracking.read refused db_error`. `docker start supabase_rest_BeStats` afterwards → AC-17
- [x] Plan a movie on its page, press Back to `/movies` → that card shows Planned → AC-20
- [x] Server log lines for failures read like `movie_tracking.watchlist refused session_expired`, with no user id, email, movie id or rating → AC-21
- [x] At 375px: the three pills wrap in the hero, no horizontal scroll, every control 44px tall, the picker fits on screen, Tab shows the focus ring on each control → AC-22

## Commands
- [x] `pnpm test:db` → all files pass, including `050-movie-tracking-functions.test.sql` → AC-4, AC-8, AC-13, AC-15, AC-18
- [x] As user B with a REST token: `GET /rest/v1/user_movie_state?movie_id=eq.550` returns none of A's rows; `PATCH` on A's row changes nothing; a POST claiming A's `user_id` gets `42501`; `rpc/rate_movie` writes only B's own row; as `anon`, `rpc/mark_movie_watched` gets `42501` → AC-18
- [x] `pnpm test` → all pass, including `app/movies/actions.test.ts`, `lib/tracking/*.test.ts`, `components/tracking/*.test.tsx`, `app/movies/request-scope.test.ts` → AC-11 to AC-15, AC-19, AC-21
- [x] `pnpm build` → `/movies` and `/movies/[id]` still marked ◐ Partial Prerender → AC-2, AC-19
- [x] `pnpm typecheck`, `pnpm lint:ci`, `pnpm db:types:check` → clean
- [x] `pnpm exec supabase db schema declarative sync --name drift_check --no-apply` → "No schema changes found" (delete any file it writes)

## Value sourcing
- [x] `user_id`: a direct REST write naming another user's id is refused (above); the action never takes one → session
- [x] `movie_id`: `setMovieWatchlist(0, true)` and a 2147483648 id return `invalid_input` (unit tests) → Zod
- [x] Trackable movie: an adult or unknown id returns `not_found` (unit tests) → `loadMovie`
- [ ] `watched_at`: the stored time is the database's `now()`, not the browser clock (set the machine clock off by an hour and compare) → Postgres
- [ ] Optimistic state equals the settled row after every click above (no second flip when `refresh()` lands) → `applyTrackingIntent`
- [x] Sign in `next`: on `/movies?page=2` the card toast's Sign in link carries `next=%2Fmovies%3Fpage%3D2` → `returnPath`

## Acceptance-criteria coverage
- AC-1 UI 2 · AC-2 UI 1, build · AC-3 UI 3, 4 · AC-4 UI 5, 6, pgTAP · AC-5 UI 7 · AC-6 UI 6 · AC-7 UI 8 · AC-8 UI 9, pgTAP · AC-9 UI 10 · AC-10 UI 11 · AC-11 UI 12, unit · AC-12 UI 13, unit · AC-13 unit, pgTAP · AC-14 UI 14, unit · AC-15 UI 15, pgTAP · AC-16 UI 16, 17 · AC-17 UI 18 · AC-18 REST, pgTAP · AC-19 build, request scope test · AC-20 UI 19 · AC-21 UI 20, unit · AC-22 UI 21
