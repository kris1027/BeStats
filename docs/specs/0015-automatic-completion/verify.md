# Verify: automatic completion · spec 0015 · updated 2026-09-30
_Steps derived from spec 0015 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Setup you may want first: `pnpm exec supabase db reset`, then `pnpm dev:docker`, and sign in as `user-a@example.test` / `password-a`. Chernobyl (TMDB 87108) is a good fixture: one season, five episodes, TMDB status `Ended`. `Q` below means `docker exec -i supabase_db_BeStats psql -U postgres -At -c`. Run `pnpm exec supabase db reset` again when you finish, or `pnpm test:db` fails on your leftover rows.

## UI / manual
- [x] Open `/shows/87108/season/1` with no status, click Mark season watched → one toast, "Marked 5 episodes watched · Chernobyl moved to Completed" with Undo, and no separate "moved to Watching" toast; the row reads `completed|system` → AC-4, AC-5
- [x] Untick episode 5 on the season page → the row reads `watching|system` right away, and no toast names the reopen → AC-8
- [x] Tick episode 5 again → toast "Chernobyl moved to Completed" with no Undo → AC-4, AC-5
- [x] Untick the special of a show you completed (any show with a season 0), or clear a rating alone → the status stays `completed|system` → AC-8, AC-9
- [x] Untick episode 5, open `/upcoming` with a second Watching show listed after it, click Mark watched on Chernobyl → toast "Marked Chernobyl S1E5 watched · Moved to Completed" with Undo, the card leaves, focus lands on the next card's title link → AC-5, AC-7
- [x] Repeat with Chernobyl as the last card (focus goes to the previous card) and as the only card (focus goes to the "Up Next" heading) → AC-7
- [x] Focus the toast's Undo with the keyboard and press Enter → Chernobyl comes back first in Up Next and its title link has the focus → AC-7, AC-8
- [x] `Q "update user_episode_state set watched_at = now() where show_id = 87108"` with the row `watching|system`, then open `/shows/87108` → the pill reads Completed and the line "5 of 5 episodes watched" → AC-10
- [x] Simulate a new episode: `set session_replication_role = replica; update user_episode_state set watched_at = null where show_id = 87108 and episode_number = 5;` (triggers off, so only the visit can notice), then open `/upcoming` → Chernobyl is listed first with S1E5, and the row reads `watching|system` → AC-11
- [x] Block one season's TMDB read (for example throw in `fetchSeason` for season 1 while testing) and repeat the two visit steps and a tick → nothing completes or reopens, no error toast, one `show_tracking.auto_complete refused incomplete` line in the server log → AC-2, AC-6, AC-12
- [x] On an automatic Completed, open the pill and choose Completed again → no toast, the label stays, the row reads `completed|user`; untick an episode → it stays Completed → AC-19, AC-14
- [x] On an automatic Watching, choose Watching again, mark every episode through SQL, reload the show page → it stays Watching → AC-14, AC-19
- [x] Set rows to On Hold, Dropped, and Completed by `user` on a caught up `Ended` show; visit the show page and `/upcoming`, tick and untick episodes → none of them changes → AC-14
- [x] `/watchlist`, `/watched`, the season page and the catalog: load each with a caught up `watching|system` row → no status changes on load → AC-13
- [x] At 375px, the combined Up Next toast wraps inside the viewport (no horizontal scroll) and the focus ring shows on the card that takes the focus → AC-7, AC-16
- [x] Two browsers (or two concurrent requests with one session) load `/upcoming` at once over 20 `watching|system` and 20 `completed|system` rows → both return 200 with the same cards, and the rows end in one state → AC-16

## Commands
- [x] `pnpm test` → all pass, including `lib/tv/auto-completion.test.ts`, `lib/tracking/auto-completion.test.ts`, `components/upcoming/mark-next-watched-button.test.tsx` → AC-1 to AC-7, AC-10 to AC-12
- [x] `pnpm exec supabase db reset && pnpm test:db` → all pass, including `130-automatic-completion.test.sql` → AC-3, AC-8, AC-9, AC-14 to AC-17, AC-19
- [x] `pnpm typecheck`, `pnpm lint:ci`, `pnpm db:types:check`, `pnpm build` → clean → all

## Value sourcing checks
- [x] TMDB show status: a show whose status is `Returning Series` never completes, even fully watched; `Canceled` completes like `Ended` → AC-1
- [x] Eligible ids: a watched special or a watched future dated episode never counts, and an unwatched special never blocks → AC-1
- [x] Read is whole: the blocked season step above → AC-2
- [x] Watched ids: `/upcoming` makes one watched ids read for every system show (unit test "checks every show, each settled on its own") → AC-11
- [x] Today: an episode airing today (UTC) must be watched before completion; one airing tomorrow need not → AC-1
- [x] Row status and source: the status matrix steps above → AC-2, AC-14
- [x] `newlyWatchedRegular`: a `watching|user` show completes on the tick of its last episode, but not on a visit, a special, or a season Undo → AC-4
- [x] `user_id` and `status_source`: user B calling either function on user A's show changes nothing (pgTAP 030 and 130) → AC-17

## Timings (AC-18)
Seeded user B with 20 `watching` and 20 `completed` shows (plus B's seeded 1396), measured on 2026-09-30 against the local stack, production build (`pnpm build && pnpm start`), time to the end of the streamed `/upcoming` response (the Up Next list is complete then; B has no planned movies, so Coming soon adds nothing):

| Case | Time |
|---|---|
| Cold TMDB cache, rows source `system` (first load after start; 20 reopens written) | 2335 ms |
| Warm, rows source `user` (no checks run) | 54 to 61 ms |
| Warm, rows source `system`, first load (20 reopens written) | 96 ms |
| Warm, rows source `system`, later loads (41 checks, no writes) | 59 to 69 ms |

Warm, the check adds about 40 ms over the same user with source `user`, inside the 500 ms budget. Under `next dev` the same warm comparison was about 1.5 s against 0.53 s, before the watched ids read was batched for the page; dev timings are not the measure.

The 20 seeded Completed rows had no watched episodes, so each first system load reopened them all; the numbers therefore include the reopen writes, the heavier case.

## Acceptance-criteria coverage
- AC-1 … unit tests (`lib/tv/auto-completion.test.ts`), value sourcing steps
- AC-2 … unit tests, blocked season step
- AC-3 … pgTAP 130
- AC-4 … season mark and single tick steps, `app/shows/actions.test.ts`
- AC-5 … toast steps, messages and component tests
- AC-6 … blocked season step, `lib/tracking/auto-completion.test.ts`
- AC-7 … Up Next focus steps, `mark-next-watched-button.test.tsx`
- AC-8 … untick steps, pgTAP 130
- AC-9 … pgTAP 130 (rating clear, 40 episode unmark, user delete in both orders)
- AC-10 … show page visit step
- AC-11 … `/upcoming` reopen step, `request-scope.test.ts`
- AC-12 … blocked season step, unit tests
- AC-13 … other pages step
- AC-14 … status matrix steps, pgTAP 130, unit tests
- AC-15 … pgTAP 130 fingerprint and reopen row checks
- AC-16 … pgTAP 130 second calls, concurrent load step
- AC-17 … pgTAP 030 and 130
- AC-18 … timings above
- AC-19 … pin step, pgTAP 090 and 130, `show-status-control.test.tsx`
