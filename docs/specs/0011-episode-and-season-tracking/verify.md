# Verify: Episode and season tracking · spec 0011 · updated 2026-09-25
_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run against the local stack (`pnpm dev:docker`). Seed users: `user-a@example.test` / `password-a`, `user-b@example.test` / `password-b`.

## UI / manual
- [x] Signed out, open `/shows/1396/season/1` → no pills, no "Upcoming", no season button, no count, no skeleton flash → AC-4
- [x] Sign in as user A, open `/shows/1396/season/1` → each row shows "Watched"/"Mark watched" and the cyan score pill with the stored value on first paint; the header shows "Mark season watched" and "2 of 7 watched" → AC-1, AC-8
- [x] Click "Mark watched" on episode 3 → it flips and the count moves at once; reload → still watched; open the same page in a second browser as A → same → AC-5, AC-13, AC-21
- [x] Click the pill again → unwatched, and its score (if any) is kept → AC-5
- [x] Rate an unwatched episode 7 → it also shows Watched; pick 8 quickly after → stores 8; "Clear rating" → "Not rated", still Watched → AC-6, AC-16
- [x] Click "Mark season watched" → every aired row and the count flip together; toast "Marked {n} episodes watched" with Undo; ratings unchanged → AC-9, AC-10, AC-13
- [x] Click Undo within 10 s → only the newly marked rows go back to unwatched; earlier watched rows keep their dates (check `watched_at` in the DB) → AC-10
- [x] With every aired episode watched, click "Season watched" → all listed rows unmark, toast "Unmarked {n} episodes" with Undo; Undo puts back each original `watched_at` → AC-11
- [x] Click "Mark season watched" when all are already watched (stale second tab) → toast "Every aired episode is already watched", no Undo → AC-10
- [x] Open a season with a future dated episode (air date after today in UTC) → the row shows "Upcoming" and no controls; mark season does not mark it → AC-2, AC-3, AC-9
- [x] In the DB, give that future episode a watched row, reload → the row shows controls; the pill can unmark but not mark; the picker shows "Airs {date}", scores disabled, Clear rating works → AC-2
- [x] Open a season where nothing has aired → button reads "Nothing aired yet", no count, still reachable with Tab, click does nothing → AC-8
- [x] Open `/shows/1396/season/0` (Specials) → same controls, button and count → AC-12
- [x] Sign out in another tab, click a pill → rolls back, toast "Your session expired. Sign in to save this." with Sign in → `/sign-in?next=/shows/1396/season/1` → AC-14
- [x] DevTools offline, mark the season → every row and the count roll back, toast "Couldn't save that change. Try again." → AC-13
- [x] Stop PostgREST (`docker stop supabase_rest_BeStats`), reload → header shows "Couldn't load your tracking." with Try again, rows show nothing, catalog renders; restart it → AC-17
- [x] At 375px: pills and header wrap, no horizontal scroll, every control is at least 44px tall, the picker fits, Tab shows the focus ring on each control → AC-23
- [x] Mark a season of 20+ episodes and watch for any row flipping back before settling → AC-13

## Commands
- [x] `pnpm test:db` → `080-episode-tracking-functions.test.sql` passes (grants, invoker rights, idempotency, duplicate id, guards, restore bounds, cross user, `user_show_state` untouched) → AC-9 to AC-11, AC-15, AC-16, AC-19, AC-24
- [x] `pnpm test` → `app/shows/actions.test.ts`, `components/tracking/season-tracking.test.tsx`, `lib/tv/*.test.ts`, `lib/tracking/episode-intent.test.ts`, `app/movies/request-scope.test.ts` pass → AC-3, AC-7, AC-13 to AC-16, AC-20, AC-22, AC-24
- [x] Load the season page signed in, then count `GET /rest/v1/user_episode_state` lines in `docker logs --since <t> supabase_kong_BeStats` → exactly 1 → AC-18
- [x] `pnpm build` → `/shows/[id]/season/[number]` is listed as ◐ Partial Prerender → AC-20
- [x] Trigger a refusal (for example a `not_aired` call) and read the dev log → one line like `episode_tracking.watched refused not_aired`, with no ids, email, count or rating → AC-22
- [x] Insert a user A row for an episode id TMDB does not list in season 1, reload → not shown, not counted, still in the DB → AC-25

## Value sourcing checks
- [x] `user_id`: as user A, call `rpc/mark_episode_watched` over REST with user B's episode id → only A's row changes → Value sourcing: `user_id`
- [x] Stored season and episode numbers: call `setEpisodeWatched` for an episode; the row's numbers match TMDB, not anything the client sent → Value sourcing: numbers
- [x] `watched_at`: equals the DB `now()` at the write, and a second mark leaves it unchanged → Value sourcing: `watched_at`
- [ ] "Today": with the server clock just before and just after UTC midnight, an episode dated the new day flips from Upcoming to markable exactly at 00:00 UTC, not local midnight → Value sourcing: today
- [x] Undo dates: a restore entry dated in the future is refused (`invalid_input` from Zod, and the SQL bound again) → Value sourcing: restored dates

## Acceptance-criteria coverage
- AC-1 UI 2 · AC-2 UI 10, 11 · AC-3 UI 10, sourcing "today" · AC-4 UI 1 · AC-5 UI 3, 4 · AC-6 UI 5 · AC-7 Commands 2 · AC-8 UI 2, 12 · AC-9 UI 6, 10 · AC-10 UI 6, 7, 9 · AC-11 UI 8 · AC-12 UI 13 · AC-13 UI 3, 15, 18 · AC-14 UI 14 · AC-15 Commands 1, 2 · AC-16 UI 5 · AC-17 UI 16 · AC-18 Commands 3 · AC-19 Commands 1, sourcing `user_id` · AC-20 Commands 4 · AC-21 UI 3 · AC-22 Commands 5 · AC-23 UI 17 · AC-24 Commands 1, 2 · AC-25 Commands 6
