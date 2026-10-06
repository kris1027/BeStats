# Verify: TV history on /watched · spec 0019 · updated 2026-10-06
_Steps derived from spec 0019 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run the app against the local stack (`pnpm dev:docker`) and sign in as `user-a@example.test` / `password-a`. Seed what each step needs through `docker exec -i supabase_db_BeStats psql -U postgres`, and `supabase db reset` before `pnpm test:db` afterwards, so leftover rows never fail pgTAP files 030 and 040.

## UI / manual
- [x] Give user A two watched movies (one rated 9) and two Completed shows: one with episodes watched yesterday, one completed by hand with nothing watched. Open `/watched` → four cards in one grid labelled "Titles you watched, page 1", in AC-2 order → AC-1, AC-2
- [x] Mark a special (season 0) of a Completed show watched now → that show moves to the first card → AC-2
- [x] Give a movie and a Completed show the same `watched_at` instant → the movie card comes first → AC-2
- [x] Give user A 21 entries across both kinds → the 21st is on `/watched?page=2`, "Page 2 of 2" shows, `/watched?page=3` redirects to `/watched?page=2`, and `/watched?page=abc` shows "That page doesn't exist" → AC-3
- [x] A show with every episode watched but status Watching is absent; set it to Completed on its show page → it appears on the next load; set it to On Hold → it vanishes, and its show page still shows the same watched episodes and ratings → AC-4
- [x] A Completed show with season 1 averaging 8 over 10 rated episodes, season 2 averaging 6 over 2, and a rated special → its card shows the cyan badge `7.0` (screen reader text "Your show rating"), and no amber TMDB badge → AC-5
- [x] A Completed show with only specials rated, or nothing rated → its card has no badge at all, not "Not rated" → AC-5
- [x] Movie cards keep their integer score badge (`9`, no decimal) or no badge when unrated → AC-5
- [x] No show card, found or missing, has any button; the only buttons in the grid are "Unmark … as watched" on movies → AC-6
- [x] Unmark a movie with a show card after it → the card hides at once, focus lands on the show's title link, the toast says "Removed from Watched" with Undo; Undo puts the movie back in its old place → AC-7 (checked in the running app on 2026-10-06 with Fight Club before The Matrix)
- [x] Unmark the last movie on page 1 of a 21 entry list → the first card of page 2 (movie or show) moves up → AC-7
- [x] Make the unmark fail (stop the local stack's REST service, or sign the session out in another tab) → the card comes back with an error toast → AC-7
- [x] Complete a show id TMDB doesn't have (for example `2147480000`) → a "No longer on TMDB" card with no title link and no button → AC-8
- [x] With no watched movie and no Completed show → "Nothing watched yet", "Movies you mark watched and shows you complete show up here.", Browse movies and Browse shows buttons; the legend under a filled grid is the single "Your score" entry → AC-9
- [x] Make the list read fail (for example rename the view in a scratch transaction, or stop PostgREST) → "Couldn't load your watched titles" with Try again, never the empty state → AC-10
- [x] Make TMDB fail (an invalid `TMDB_READ_ACCESS_TOKEN` in a scratch run) → "Couldn't reach TMDB" with Try again → AC-10
- [x] Signed out, open `/watched` → redirected to sign in, with no list data in the response → AC-11
- [x] Load `/watched` and compare `user_show_state` and `user_episode_state` before and after → no row changed, even for a Completed show whose `status_source` is `system` → AC-13
- [x] At 375 px wide, tab from the heading → each show card's title link takes a visible focus ring; there is no horizontal scroll; cards match the movie card look of `design/mobile-watched-page.svg` and `design/desktop-watched-page.svg` → AC-14 (checked on 2026-10-06: 2 px solid focus ring on "Game of Thrones", page 360 px wide inside a 375 px viewport)

## Value sourcing
- [x] Order and kind come from `user_watched_entries`: change a movie's `watched_at` to tomorrow → it jumps to the first card → AC-2
- [x] A show's sort time is its newest watched episode in any season, else `status_changed_at`: unmark every episode of a Completed show → it moves to the time it became Completed → AC-2
- [x] Total and last page come from the exact count of the same query: 40 entries end at page 2, 41 at page 3 → AC-3
- [x] Card status and time: a show card is `completed` with no watched time, so it never offers Undo or Unmark → AC-6
- [x] The movie badge is `user_movie_state.rating`: change it to 4 → the card shows `4` → AC-5
- [x] The show badge is `showRating(ratingsBySeason(...))` over the rated episodes: rate one more season 2 episode 10 → season 2 averages 8, the badge reads `8.0` → AC-5
- [x] Title and poster come from TMDB: a show TMDB lacks shows the missing card → AC-8
- [x] The card link is kind plus id: a movie and a show sharing an id open `/movies/{id}` and `/shows/{id}` → AC-5
- [x] Undo restores the exact `watched_at` PostgREST returned: after Undo, the movie's row holds the same microseconds as before → AC-7
- [x] Empty and failure copy is `COPY.watched` → as in the AC-9 and AC-10 steps above

## Commands
- [x] `pnpm typecheck` → passes (2026-10-06) → all
- [x] `pnpm lint` → 356 files, no fixes (2026-10-06) → all
- [x] `pnpm test` → 124 files, 1,866 tests pass (2026-10-06) → AC-1 to AC-13
- [x] `supabase db reset && pnpm test:db` → 17 files, 434 tests pass, including `150-watched-entries.test.sql` (2026-10-06) → AC-1, AC-2, AC-4, AC-12
- [x] `pnpm db:types:check` → types match the schema (2026-10-06) → AC-12
- [x] `pnpm build` → `/watched` is still `◐` Partial Prerender (2026-10-06) → AC-13
- [x] Direct REST read: as user B, `GET /rest/v1/user_watched_entries` → none of user A's rows; with the anon key alone → 401 or permission denied; `POST` to the view → refused → AC-12

## AC-15 timing (local stack, 2026-10-06)
Seeded in a rolled back transaction for user B: 700 watched movies, 300 Completed shows and 5,000 episode rows across seasons 0 to 4, tables analyzed, queries run as `authenticated` with B's JWT claims so RLS applies.

| Query | Plan | Execution time |
|---|---|---|
| Page 1 (`order by last_watched_at desc, kind, tmdb_id limit 20`) | top N heapsort over the union | 2.42 ms |
| Page 50 (`offset 980`) | quicksort over the union | 2.58 ms |
| Count only reread (`count(*)`) | aggregate over the union | 2.18 ms |
| `getShowRatings` page (20 shows, `rating is not null`) | bitmap scan on `user_episode_state_show_order_idx` | 0.10 ms |

Every query is far under the 50 ms budget, so the planned partial index on `user_episode_state (user_id, show_id, watched_at desc)` was not added (spec Follow-up).

## Acceptance-criteria coverage
- AC-1: UI step 1, pgTAP 150, `library-section.test.tsx`
- AC-2: UI steps 1 to 3, value sourcing steps 1 and 2, pgTAP 150, `library-lists.test.ts`
- AC-3: UI step 4, value sourcing step 3, `library-section.test.tsx`, `library-lists.test.ts`
- AC-4: UI step 5, pgTAP 150
- AC-5: UI steps 6 to 8, value sourcing steps 5, 6 and 8, `show-ratings.test.ts` (`getShowRatings`), `library-grid.test.tsx`
- AC-6: UI step 9, value sourcing step 4, `library-grid.test.tsx`
- AC-7: UI steps 10 to 12, value sourcing step 9, `library-grid.test.tsx`
- AC-8: UI step 13, `library-grid.test.tsx`, `library-section.test.tsx`
- AC-9: UI step 14, `library-section.test.tsx`
- AC-10: UI steps 15 and 16, `library-section.test.tsx`, `show-ratings.test.ts`
- AC-11: UI step 17, `library-section.test.tsx`
- AC-12: the REST command step, pgTAP 150
- AC-13: UI step 18, `app/movies/request-scope.test.ts`, `pnpm build`
- AC-14: UI step 19
- AC-15: the timing table above
