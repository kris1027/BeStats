# Verify: TV status and progress · spec 0013 · updated 2026-09-26
_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Setup: `pnpm exec supabase db reset` then `pnpm dev:docker`. Sign in as `user-a@example.test` / `password-a` (user B: `user-b@example.test` / `password-b`). The seed gives user A Breaking Bad (1396) as Watching and Game of Thrones (1399) as Want to Watch.

## UI / manual
- [x] Signed out, open `/shows/1396` → the hero shows no status pill and no progress line; `/shows` and `/search?type=tv&q=breaking` cards show no bookmark → AC-5, AC-18
- [x] Signed in, open `/shows/1396` → pill reads "Watching" with the TV glyph and a chevron; below it "{n} of {total} episodes watched" with a green bar → AC-1, AC-10
- [x] Focus the pill, press Enter → menu "Show status" opens with Want to Watch, Watching (checked), On Hold, Dropped, Completed, a separator, then "Remove status" in the destructive colour; arrows move, Enter picks, Escape closes and focus returns to the pill → AC-1
- [x] Pick On Hold → pill reads "On Hold" at once; reload keeps it; in Studio the row is `on_hold` / `user` and no `user_episode_state.updated_at` moved → AC-2, AC-3
- [x] Open the menu and pick On Hold again → no request is sent (Network tab) → AC-2
- [x] Choose Remove status → pill reads "Add to my shows", toast "Removed Breaking Bad from your shows" with Undo; Undo → pill reads On Hold again, `listed_at` unchanged → AC-4, AC-19
- [x] Remove a status, wait more than 10 minutes, then press Undo (or remove it in a second tab and set a status again, then Undo in the first) → "Couldn't undo. Change the status from the show page." → AC-19
- [x] Stop the local stack's REST container (or sign out in another tab) and change the status → pill rolls back, session expired toast offers Sign in → AC-2, AC-21
- [x] With no status on a show, open season 1 and mark episode 1 → toast "{show} moved to Watching"; mark episode 2 → no second toast; row is `watching` / `system` → AC-6, AC-8
- [x] On an On Hold or Dropped show, mark an episode → status unchanged, no toast → AC-6
- [x] On an untracked show, mark only a Specials episode → no toast, no status row → AC-7
- [x] Unmark the episode that started a show → status stays Watching → AC-7
- [x] A show whose seasons have not aired (pick one with only a future first air date) with a status → "No episodes have aired yet", no bar → AC-9, AC-10
- [ ] Mark a special and an upcoming episode watched on a tracked show → the count does not change → AC-9
- [x] Open `/watchlist` → movies and shows in one grid, newest first; the Game of Thrones card has the TMDB badge, the Next episode pill (`S1E1`, or the first unwatched aired episode) bottom left and the Planned bookmark (Want to Watch) or Stop watching (Watching) bottom right; the legend reads TMDB rating, Planned, Stop watching, Next episode → AC-13, AC-15, AC-16, AC-17
- [x] Mark every aired episode of a Watching show → its pill reads "Up to date" → AC-15
- [x] Plan a movie, then plan a show, then plan another movie; start the show by marking an episode → order stays movie, show, movie → AC-13, AC-14
- [x] Press Stop watching on a Watching card → card leaves, focus moves to the next card title, toast "{show} moved to On Hold" with Undo; Undo → card returns in the same place with its old source → AC-16, AC-19
- [x] Press the Planned bookmark on a Want to Watch card → card leaves, toast "Removed {show} from your shows"; Undo restores it → AC-16
- [x] On `/shows`, press Plan on a card → it turns into the filled Planned bookmark ("Remove {show} from watchlist"); the show appears on `/watchlist`; a Watching or On Hold show's card has no bookmark → AC-18
- [x] On `/search?type=tv&q=...` TV results carry the same bookmark → AC-18
- [x] At 375px: the hero pill and menu fit with no horizontal scroll, menu items are 44px tall; the progress line and watchlist TV cards fit; every control shows the focus ring by keyboard → AC-22
- [x] Break the status read (for example revoke select on `user_show_state` from `authenticated` in a throwaway local DB) → disabled "Status unavailable" pill with Try again, never "Add to my shows" → AC-5
- [ ] Make a season read fail (offline TMDB token in a throwaway env) on a tracked show → "Progress unavailable right now" with Try again, no number; the pill still works → AC-11

## Value sourcing
- [x] Status and label: change the row in Studio, reload → the pill follows the row → value `status`
- [x] "Add to my shows": delete the row in Studio → the pill reads it → row presence
- [ ] `status_source`: set a status from the hero after an automatic start → Studio shows `user` → fixed in `set_show_status`
- [x] Undo payload: Stop watching a `system` Watching show, Undo → source back to `system` → `previous_*` columns
- [ ] `show_started`: mark an already watched episode again → no toast → `start_watching_show` result
- [x] Owner: every call above as user B leaves user A's rows untouched → `auth.uid()`
- [x] `listed_at`: Want to Watch → Watching keeps the card in place; On Hold → Watching moves it to the top → trigger
- [ ] `today`: with the machine clock near UTC midnight, an episode dated today UTC counts as aired → `requestTodayUtc()`
- [ ] Eligible episodes: a show with specials and a future episode counts neither → `getShowEpisodes`
- [ ] `complete`: a failed season read hides every number → `getShowEpisodes(...).complete`
- [ ] Watched set: a watched episode id TMDB no longer lists never counts → matched by episode id
- [x] Progress line visibility: an untracked show with only a watched special shows no line → watched regular id or row
- [x] Next episode pill: equals the first unwatched aired regular episode in season then episode order → `showProgress(...).next`
- [ ] Card name, poster, TMDB rating: match the show page → `getTvShowsByIds`
- [x] Card button: Want to Watch → Planned, Watching → Stop watching → row status from the view
- [x] Toast show names: match the card, hero and season header names → rendered names
- [ ] Removal Undo window: `removed_at` from `remove_show_status` bounds it → Undo after 10 min refused

## Commands
- [x] `pnpm typecheck` → passes → all
- [x] `pnpm lint:ci` → passes → all
- [x] `pnpm test` → passes (progress rule, actions, status control, list reads, request scope) → AC-2, AC-4, AC-8, AC-9, AC-12, AC-13, AC-19, AC-21, AC-22
- [x] `pnpm test:db` → passes (`090-show-status-functions`, `100-automatic-watching`, `110-watchlist-entries`, amended `080`) → AC-3, AC-6, AC-7, AC-14, AC-19, AC-20
- [x] `pnpm db:types:check` → types match the schema → migration
- [x] `pnpm build` → `/shows`, `/shows/[id]`, `/search`, `/watchlist` still ◐ Partial Prerender → AC-22
- [x] As user B over PostgREST: `GET /rest/v1/user_watchlist_entries` returns only B's rows; `GET /rest/v1/user_show_state?user_id=eq.<A>` returns `[]`; `POST /rest/v1/rpc/remove_show_status {"p_show_id":1399}` returns `[]` and A's row survives; anon `GET` on the view returns `42501` → AC-20

## Query plan (build plan step 6), recorded 2026-09-26
Seeded user A with 300 movie rows (200 planned) and 300 show rows (150 Want to Watch or Watching), then `explain analyze` of the page query as `authenticated`, page 2:

- Default plan: `Append` of a seq scan on each table, `WindowAgg` for the count, then `Sort` with **top-N heapsort** (27 kB), 0.37 ms total. At this size a seq scan is cheaper than either index.
- With `enable_seqscan = off`: `Bitmap Index Scan on user_show_state_watchlist_idx` for shows and on `user_movie_state_pkey` for movies, then the same top-N heapsort, 0.23 ms.
- **Not as the spec expected.** The spec asked for both partial indexes used and no full sort. The planner never produces an index ordered merge across the union (the constant `kind` breaks the shared sort key), and the exact count needs every one of the user's listed rows anyway. The sort is a top-N heapsort over one user's rows, never a sort of either whole table, and it stays under a millisecond at 350 entries. Flagged for `/check verify` to judge; no change made.

## Acceptance-criteria coverage
- AC-1 … hero pill and menu steps, keyboard step, `show-status-control.test.tsx`
- AC-2 … pick On Hold, same status, session expired steps; component and action tests
- AC-3 … `090` pgTAP (episode rows unchanged), Studio check
- AC-4 … Remove status + Undo step; action and component tests
- AC-5 … visitor and read failure steps
- AC-6, AC-7 … season page steps; `100-automatic-watching` pgTAP
- AC-8 … toast steps; `showStarted` action tests
- AC-9 … `lib/tv/progress.test.ts`, none aired and specials steps
- AC-10, AC-11 … progress line and failure steps
- AC-12 … request scope test (no `use cache`), value sourcing steps
- AC-13, AC-14 … watchlist order steps; `110-watchlist-entries` pgTAP, `090` listed_at tests
- AC-15, AC-16, AC-17 … watchlist card, Stop watching and legend steps; library tests
- AC-18 … `/shows` and `/search` bookmark steps
- AC-19 … Undo steps; `090` restore branches; action tests
- AC-20 … PostgREST command; `090`, `100`, `110` cross user tests
- AC-21 … action validation and session tests
- AC-22 … 375px step, build command, request scope test
