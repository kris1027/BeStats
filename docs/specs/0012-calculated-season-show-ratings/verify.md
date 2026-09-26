# Verify: Calculated season and show ratings · spec 0012 · updated 2026-09-26
_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run against the local stack with `pnpm dev:docker`. Seed users: `user-a@example.test` / `password-a`, `user-b@example.test` / `password-b`. Breaking Bad is show `1396`.

## UI / manual
- [x] Signed in as user A, open `/shows/1396/season/1`, rate episodes 10, 8 and 7 → header reads "Your season rating 8.3 from 3 rated episodes" → AC-1, AC-3, AC-5
- [x] On the same page, clear one rating → the season rating and its count change in the same moment as the score pill → AC-4, AC-6
- [x] Unmark a rated episode, then use "Season watched" and Undo → the season rating never changes → AC-4, AC-6
- [x] With the network offline (DevTools), pick a score → the rating moves, then returns to its old value with the pill and the failure toast shows → AC-6
- [x] Rate one episode 6 in season 2, then open `/shows/1396` → the Seasons heading row reads "Your show rating 7.2 from 2 rated seasons" (the mean of 8.33 and 6), not the episode mean → AC-2, AC-7
- [x] With a Specials episode rated, the heading basis ends in "· Specials not included" and the show value is unchanged → AC-2, AC-7
- [x] A user with only Specials rated sees "Your show rating Not rated Specials not included"; a user with no ratings sees "Your show rating Not rated" and no basis, never `0.0` → AC-3, AC-7
- [x] Season cards 1, 2 and Specials carry a cyan badge; unrated seasons show no mark at all → AC-8, AC-15
- [x] Rate on a season page, press Back → the show rating and card badge are already updated; reload and a second browser as user A agree → AC-12
- [x] Open `/shows/1396/season/0` → the Specials header shows its own season rating; a Specials season with nothing aired shows the rating beside "Nothing aired yet" → AC-5
- [x] Signed out, open `/shows/1396` and a season page → no rating label, pill, basis or card badge, no skeleton, no error → AC-10
- [x] Temporarily break the read (for example stop the local stack's REST service) and open `/shows/1396` → the heading row shows "Couldn't load your tracking." with Try again to `/shows/1396`, no card badges, rest of page normal; server log has one line `show_tracking.rating_read refused db_error` → AC-11
- [x] At 375px, the season header row, the heading row and the card badges wrap or fit with no horizontal scroll; Tab never stops on a rating → AC-16
- [x] Sign in as user B in a second browser → none of user A's ratings appear on either page → AC-13

## Value sourcing
- [x] Season header counts only episodes the page lists: a stored rating on an episode id TMDB no longer lists (for example Specials row `62119` in the local data) is left out of the Specials header → AC-5
- [x] Show page groups by stored `season_number` and counts that same orphan row, so the Specials card may differ from the Specials header; this is the accepted tradeoff → AC-9
- [x] Rounding: exact ties display half up (`8.05` → `8.1`, `7.25` → `7.3`); whole values show one decimal (`7.0`, `10.0`) → AC-3
- [x] `user_id` for the read comes from the session only: the REST request in Commands returns `[]` for user B → AC-13

## Commands
- [x] `pnpm typecheck` → passes → AC-17
- [x] `pnpm lint` → passes → AC-17
- [x] `pnpm test` → passes, including `lib/tv/ratings.test.ts`, `lib/tracking/show-ratings.test.ts`, `components/tracking/show-rating.test.tsx` and the season rating block in `season-tracking.test.tsx` → AC-1 to AC-8, AC-11, AC-17
- [x] `pnpm build` → `/shows/[id]` and `/shows/[id]/season/[number]` still listed as Partial Prerender → AC-10, AC-13
- [x] Load `/shows/1396` once as user A and read `docker logs supabase_kong_BeStats` for that window → exactly one `GET /rest/v1/user_episode_state?select=season_number,rating...` → AC-9
- [x] As user B, `GET /rest/v1/user_episode_state?select=season_number,rating&show_id=eq.1396&rating=not.is.null` with B's token → `[]` → AC-13
- [x] `git grep -n "season_rating\|show_rating" supabase/` → nothing; no migration added → AC-14

## Acceptance-criteria coverage
- AC-1, AC-2, AC-3: unit tests plus the header and heading steps · AC-4: clear and unmark steps · AC-5: season header and Specials steps · AC-6: optimistic and offline steps · AC-7: heading steps · AC-8: card step · AC-9: read count and orphan steps · AC-10: signed out and build steps · AC-11: read failure step · AC-12: Back and reload step · AC-13: user B steps · AC-14: no migration step · AC-15: card and heading steps · AC-16: 375px step · AC-17: commands

## Run on 2026-09-26 (/develop)
- Local stack, user A: season 1 read 9.0 from 2, then 8.3 from 3 after rating 7; season 2 read 6.0 from 1; show page read 7.2 from 2 rated seasons · Specials not included; cards 8.3, 6.0, none for 3 to 5, Specials 8.0 (Specials header 9.0, the orphan row `62119` explains the difference).
- Signed out `curl /shows/1396` showed no rating text; user B REST read returned `[]`; one REST read per show page render; 375px had no horizontal scroll and unrated card badges measured 0×0.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (1208 passed), `pnpm build` all passed.
- Not yet run: the offline rollback in a real browser (covered by a component test), and the read failure in the running app (covered by unit and component tests).

## Run on 2026-09-26 (/check verify)
- Ran against the local stack on port 3001 (port 3000 was taken by another app), with the same public env exports as `pnpm dev:docker`. Password sign in only, so the redirect allow list did not matter.
- Season 1: 8.3 from 3; rate Cancer Man 9 → 8.5 from 4 in the same commit as the pill; clear → 8.3 from 3; unmark Pilot, Season watched, Undo → 8.3 throughout. Offline pick 2 → 6.8 from 4, then back to 8.3 with the pill and "Couldn't save that change. Try again."
- Show page: 7.2 from 2 rated seasons · Specials not included; cards S1 8.3, S2 6.0, Specials 8.0, S3 to S5 none; Kong log showed exactly one `user_episode_state?select=season_number,rating` read. Rate Grilled 8 on season 2 → 7.0, Back → 7.7 and card 7.0; reload and a second user A context both 7.7 (rating cleared afterwards).
- Specials header 9.0 from 1 (orphan `62119` left out). "Nothing aired yet" branch seen on `/shows/84773/season/3` with "Your season rating Not rated"; its episodes are future dated so not rateable, so a numeric value there was not shown.
- User B: "Not rated" with no basis and no card badges; Specials only → "Not rated Specials not included"; REST read `[]`. Signed out: no rating text or slots on either page.
- PostgREST stopped: heading "Couldn't load your tracking." + Try again to `/shows/1396`, no card badges, one log line `show_tracking.rating_read refused db_error`; season page kept its retry line.
- 375px: no horizontal scroll on either page, no tab stop on a rating. typecheck, lint, test (1208), build (both routes Partial Prerender) passed; the only `supabase/` grep hit is the schema test that asserts those columns are absent.
