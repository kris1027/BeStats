# Verify: Up Next · spec 0014 · updated 2026-09-28 (proof run)
_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run the app against the local stack with `pnpm dev:docker`, and sign in as `user-a@example.test` / `password-a` (after `pnpm exec supabase db reset`). The fixtures below use real TMDB ids; pick dates relative to the day you run this.

Fixture for user A (`11111111-1111-1111-1111-111111111111`), run as `postgres`:
- Shows: 247718 MobLand `watching` with every aired regular episode watched (caught up, a dated next episode); 1396 Breaking Bad `watching` with S1E1 (episode 62085) watched; 95396 Severance `watching`, nothing watched, status changed most recently; 1399 `on_hold`; 100088 `want_to_watch`.
- Planned movies: two or three with a release date after today (for example 1400940, 1003596, and 755679 dated in a later year), plus 550 (released 1999).

## UI / manual
- [x] Signed out, open `/upcoming` → redirected to `/sign-in?next=%2Fupcoming` → AC-1
- [x] Signed in, the navbar library links read Watchlist, Upcoming, Watched (desktop bar and mobile menu); on `/upcoming` the Upcoming link has `aria-current="page"` → AC-1
- [x] `/upcoming` shows h1 "Upcoming", then h2 "Up Next", then h2 "Coming soon"; on a slow load the heading shows at once with a skeleton of both sections → AC-2
- [x] Up Next lists Severance, Breaking Bad, MobLand in that order (latest regular episode or status change first); On Hold and Want to Watch shows never appear → AC-3
- [x] Breaking Bad's pill reads S1E2 (screen reader: "Next episode, season 1 episode 2"); Severance reads S1E1 → AC-4, AC-5
- [x] MobLand shows "You're up to date" under its name and a calendar pill `S2E3 · Oct 2` style (short date inside today's UTC year, `Feb 3, 2027` style otherwise); its screen reader text says "Next episode, season … episode …, airs …" → AC-4, AC-5
- [x] A caught up show with no dated next episode shows the "Up to date" pill; a Watching show with nothing aired shows no pill (or "Season … episode … airs …" when TMDB has a date) → AC-5
  - Proof run: Breaking Bad fully watched shows "Up to date" with the caption; Neuromancer (215528, first airs Jan 21, 2027) shows `S1E1 · Jan 21, 2027` with "Season 1 episode 1 airs Jan 21, 2027". The no date, no pill branch is covered by `lib/tv/up-next.test.ts` only; no real TMDB show was found for it.
- [x] No card shows "0 of 0" or a percentage; only `next` cards have a Mark watched button → AC-5, AC-8
- [x] Throttle TMDB (or block `api.themoviedb.org`) for one show: posters and titles render first, then that card reads "Next episode unavailable" with Try again, no button, no caption → AC-6, AC-7
- [x] Put a Watching row on a show id TMDB does not have: the card reads "No longer on TMDB" with no link, pill or button → AC-7
- [x] Tap Mark watched on Breaking Bad: button disabled with `aria-busy="true"` while it runs; the card moves to the top with S1E3; toast "Marked Breaking Bad S1E2 watched" with Undo; focus lands on the Breaking Bad title link (`#up-next-1396`) → AC-8, AC-9, AC-16
- [x] With focus on the toast, activate Undo: the card returns to S1E2 and focus returns to `#up-next-1396`; any rating on that episode is kept; the show stays Watching → AC-9, AC-10, AC-16
- [x] Undo by mouse with focus elsewhere: the card returns, and focus is not moved → AC-16
- [x] Mark S1E2 in a second tab (or directly in the database), then tap the stale button: toast "Breaking Bad S1E2 was already watched", no Undo, the page refreshes → AC-9
- [x] Mark the last aired episode of a show: the button disappears, "You're up to date" appears, focus lands on that card's link → AC-8, AC-16
- [x] Sign out in another tab, then tap Mark watched: the session expired toast with Sign in; the card stays; no refresh → AC-10
- [x] Coming soon lists only planned movies released after today, soonest first (ties by title then id); 550 and undated movies are absent (they remain on `/watchlist`) → AC-11
- [x] Each Coming soon card: calendar pill (screen reader "Releases Oct 21, 2026"), green Planned bookmark "Remove {title} from watchlist", no rating badge → AC-12
- [x] Tap a bookmark: the card hides at once, focus moves to the next card (else previous, else the "Coming soon" heading), toast "Removed from Watchlist" with Undo; Undo puts it back in date order → AC-12
- [x] With more than 200 planned movies, "Checked your 200 most recently planned movies" shows under the heading → AC-11
- [x] No Watching show: "Start watching a show and its next episode shows up here." with Browse shows; no upcoming movie: "No planned movies are waiting for release." with Browse movies; both empty: one "Nothing upcoming yet" panel with both links → AC-13
- [x] No Watching show, more than 200 planned movies, and none of the newest 200 upcoming: both sections stay (Up Next empty line; Coming soon shows "Checked your 200 most recently planned movies" then its empty line), never the "Nothing upcoming yet" panel → AC-11, AC-13
- [x] `revoke select on public.user_up_next_shows from authenticated`, reload: Up Next shows its failure message with Try again, Coming soon renders normally; grant it back afterwards. Fail both reads: each h2 shows its own failure, never the empty panel → AC-14
- [x] At 375px: two column grid, no horizontal scroll (`scrollWidth === 375`), pills never overlap the round button, every button 44px; a date with a year (`Mar 16, 2028`) is not cut off → AC-16
- [x] At 375px, on one Up Next card and one Coming soon card: `document.elementFromPoint` at the centre of the poster and at the centre of the title line both return a node whose `closest("a")` is that card's title link (the `<a>` box itself is one text line, about 20px, and is not the measure); the card's hit area is at least 44px tall and wide; a point on the pill or the round button returns that pill or button, not the link. The "No longer on TMDB" card has no link and is skipped → AC-16
  - Proof run: Severance card 164×279, Digger (Coming soon) card 164×275; poster centre and title line centre both hit the card link; the `<a>` box is 17px; the pill hits the pill on both cards; the round buttons are 44×44 and hit themselves; `scrollWidth` 375.
- [x] Keyboard only: Tab reaches every card link, Mark watched, Planned bookmark, toast action and Try again, with a visible focus ring → AC-16

## Commands
- [x] `pnpm test:db` → all pass, including `120-up-next.test.sql` (status filter, activity rule, tiebreak, cross user, `anon` 42501, `newly_marked` true then false) → AC-3, AC-9, AC-15
- [x] As user B, `GET /rest/v1/user_up_next_shows` with B's token → none of A's rows; with only the anon key → 42501 → AC-15
- [x] `pnpm test` → all pass, including `lib/tv/up-next.test.ts`, `lib/tracking/up-next.test.ts`, `lib/format.test.ts` (`formatShortDate`), `app/upcoming/request-scope.test.ts` → AC-4, AC-5, AC-11, AC-15
- [x] `pnpm typecheck`, `pnpm lint:ci`, `pnpm db:types:check` → clean → AC-15
- [x] `pnpm build` → `/upcoming` listed as `◐` (partial prerender) → AC-2
- [x] `explain analyze` of the view read for a user with 50 Watching shows and 5,000 watched episodes → under 50 ms. Measured 2026-09-28 on the local stack as `authenticated` under user A's claims, with 20 more users of the same volume in the tables (105,000 episode rows): 2.1 ms execution, 0.12 ms planning, 196 shared buffer hits; `user_episode_state_show_order_idx` and `user_show_state_watchlist_idx` both used → AC-15
- [x] Cold cache load of `/upcoming` with 20 Watching shows and 200 planned movies → record the time to first card and to the last pill → Consequences
  - Measured 2026-09-28: fresh `pnpm start` against the local stack, 1280px, user A with 20 Watching shows and 242 planned movies (so the 200 ceiling applied and its line showed). Cold: heading 77 ms, first card 8.4 s, last pill 17.1 s. Warm (same server, next load): first card 367 ms, last pill 369 ms. All 20 pills resolved, none unavailable.
  - The first card waits on both sections, because `UpcomingSections` reads them in one `Promise.all`; cold, that is mostly the 200 movie summaries. The last pill is the 20 show season fan out. This is the slow cold load the spec's Consequences follow up box anticipates; nothing was added.

## Value sourcing
- [x] Which shows: change a Watching show to On Hold, reload → it leaves Up Next (view filter)
- [x] Order: mark a special (season 0) on the bottom show → its place does not change; mark a regular episode → it moves to the top
- [x] Pill state: with a show's next episode airing today in UTC, it is offered as `next`; tomorrow in UTC, it shows as the dated pill
  - Proof run: the boundary is locked by `lib/tv/up-next.test.ts` ("counts an episode airing today as aired"), and both `UpNextPill` and `UpcomingSections` take `today` from `requestTodayUtc()`.
- [x] Short vs long date: a date in today's UTC year prints without the year; next year's prints with it
- [x] Mark watched ids: the button marks exactly the episode the pill names (check the new row's `episode_id`)
- [x] Undo offered: `newly_marked` from the database decides it (the second tab step above)
- [x] Coming soon candidates and ceiling: 201 planned movies → only the 200 most recently planned are checked, and the ceiling line shows
- [x] Which movies are upcoming: a movie releasing today in UTC is absent; tomorrow it is present
  - Proof run: locked by `lib/tracking/up-next.test.ts` ("keeps only known dates after today", today and tomorrow cases) with `today` from `requestTodayUtc()`; in the app, Digger (Sep 30) listed first on Sep 28.
- [x] Owner: user B's session never shows user A's cards
  - Proof run: with A on Severance, Neuromancer and Breaking Bad plus six upcoming movies, B's `/upcoming` listed only B's own Severance card and B's empty Coming soon line.

## Acceptance-criteria coverage
- AC-1: signed out redirect, nav links · AC-2: page structure, skeleton, build output · AC-3: order and exclusion, pgTAP · AC-4: pill episodes, unit tests · AC-5: every pill state and caption · AC-6: per card streaming · AC-7: unavailable and missing title cards · AC-8: Mark watched pending · AC-9: toast, Undo, second tab, pgTAP · AC-10: session expired, rating and status kept · AC-11: filter, order, ceiling · AC-12: Coming soon card and removal · AC-13: empty lines and panel · AC-14: independent failures · AC-15: pgTAP, PostgREST, request scope test, query plan · AC-16: 375px and keyboard, focus return
