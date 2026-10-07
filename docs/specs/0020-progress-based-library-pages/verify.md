# Verify: Progress based library pages · spec 0020 · updated 2026-10-07
_Steps derived from spec 0020 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Setup: `pnpm exec supabase db reset`, then `pnpm dev:docker`, and sign in as `user-a@example.test` / `password-a`. The fixtures below are SQL against the local stack (`docker exec -i supabase_db_BeStats psql -U postgres`); reset again when you finish.

## UI / manual
- [x] On `/shows/1399` (tracked in the seed) the hero shows a pill **Tracking**; open it → Pause, Drop, Stop tracking → AC-2
- [x] Choose Pause → pill reads **Paused**, menu offers Resume, Drop, Stop tracking; reload, still Paused → AC-2
- [x] Choose Stop tracking → pill becomes **Plan to watch**, toast "Stopped tracking Game of Thrones" with Undo; Undo → pill back to Paused, and the row's `tracked_at`, `hold_state`, `hold_changed_at` are exactly as before (SQL) → AC-3
- [x] Open the same show in two tabs; Drop in tab 1, then Resume in tab 2 → toast "This show changed elsewhere. Showing the current one." and tab 2 refreshes to Dropped → AC-4
- [x] On `/shows/1434/season/1` (untracked) mark episode 1 → toast "Family Guy added to your shows"; Pause it on the show page, mark episode 2 → no tracking toast, still Paused → AC-5
- [x] On `/shows` the bookmark of a tracked show is filled and of an untracked one empty; clicking the empty one tracks it, clicking a filled one stops tracking with Undo → AC-6
- [x] Seed The Simpsons (456) watched through its latest aired episode minus one; `/watchlist?type=tv` shows it with the next episode "S38E2" plus its name, and Mark watched → AC-7, AC-9
- [x] Press Mark watched → toast with Undo, the card leaves Watchlist, the focus lands on the next card's title; `/upcoming?type=tv` now shows "S38E3 · Oct 18" (or the current next date) → AC-7, AC-9, AC-11
- [x] Press Undo on that toast → the card returns to Watchlist → AC-9
- [x] A show with every aired episode watched and nothing dated (Chernobyl 87108, all 5) is on `/watched?type=tv` labelled **Finished**; an ongoing one (The Last of Us 100088, all 16) reads **Caught up**; each is on no other tab → AC-8, AC-12
- [x] Pause a show → it leaves all three tabs and appears under the collapsed **Paused & dropped (N)** disclosure at the bottom of Watchlist page 1 with a Paused label; Resume → it goes back to the tab its progress gives → AC-8, AC-10
- [x] Hold every tracked show → Watchlist shows "Nothing to watch right now" above the Paused & dropped section → AC-10, AC-18
- [x] Plan a movie released after today (1003596) → `/upcoming?type=movie` shows it with "Dec 16"; a released planned movie is on `/watchlist?type=movie`; mark a planned movie watched → it is on `/watched?type=movie` only, and the movie page's Add to watchlist stays planned; unmark it → back on Watchlist or Upcoming → AC-13, AC-14
- [x] `/upcoming` has no Up Next section and no Mark watched on either tab → AC-15
- [x] With 21 or more cards on a tab, page 2 exists and `?page=99` redirects to the last page; `?page=x` shows "That page doesn't exist" → AC-16
- [x] Track a show id TMDB does not have (e.g. 999999999 by SQL) → a "No longer on TMDB" card at the end of Watchlist with Stop tracking → AC-17
- [x] Each empty tab shows its own copy and Browse button (six tabs) → AC-18
- [x] 375px wide: all six tabs and the show page keep two columns, pills and buttons fit, and the disclosure, Mark watched, Resume and the tracking menu work with Tab, Enter and Space → AC-18

## Commands
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` → all pass (2046 tests on 2026-10-07) → every AC
- [x] `pnpm exec supabase db reset && pnpm test:db` → all 18 files pass, including `160-show-tracking.test.sql` → AC-1, AC-3 to AC-5, AC-20
- [x] `pnpm build` → succeeds, the three library pages stay partial prerender (◐) → AC-22
- [x] Migration mapping: `pnpm exec supabase db reset --version 20261006120000`, insert legacy rows in each of the five statuses with `session_replication_role = replica`, then `pnpm exec supabase migration up` → Want to Watch, Watching and Completed have no hold, On Hold is `paused`, Dropped `dropped`; `tracked_at = coalesce(listed_at, status_changed_at)`, a held row's `hold_changed_at = status_changed_at`, and `updated_at` and every episode and movie row unchanged (checked 2026-10-07) → AC-19
- [x] `grep -rn "status_source\|tv_status\|TvStatus" app components lib --include='*.ts*' | grep -v database.types` → no hits → AC-1
- [x] `pnpm vitest run app/movies/request-scope.test.ts` → the no writes on load scan passes for `/watchlist`, `/upcoming`, `/watched` and `/shows/{id}` → AC-21

## Timing (AC-24)
Seeded user B with 100 tracked shows and 100 planned movies (TMDB popular lists), each show with two watched episodes, `pnpm build && pnpm start` against the local stack, measured from navigation to the grid's legend on 2026-10-07:

| Tab | Cold | Warm |
|---|---|---|
| `/watchlist?type=tv` | 5.3 s | 0.37 s |
| `/upcoming?type=tv` | 0.35 s | 0.34 s |
| `/watched?type=tv` | 0.36 s | 0.35 s |
| `/watchlist?type=movie` | 3.9 s | 0.36 s |
| `/upcoming?type=movie` | 0.42 s | 0.35 s |
| `/watched?type=movie` | 0.34 s | 0.35 s |

The cold time is the first tab of each media type filling the TMDB cache; the other tabs of that type reuse it. Warm is under 1.5 s on every tab.

## Rollout (Migration plan, needs your approval)
- [ ] `supabase db push` the expand migration `20261007120000_show_tracking_expand.sql`, then merge and let Vercel deploy → phase 1 and 2
- [ ] On production, open each tab, track, pause, resume, stop and undo on a test account → phase 2
- [ ] Contract migration as its own follow up PR → phase 3 (Build plan step 8, not in this build)

## Acceptance-criteria coverage
- AC-1 pgTAP 160, grep · AC-2 UI 1, 2, `show-tracking-control.test.tsx` · AC-3 UI 3, pgTAP 160 · AC-4 UI 4, pgTAP 160 · AC-5 UI 5, pgTAP 160 · AC-6 UI 6, `show-card-bookmark-button.test.tsx` · AC-7 UI 7, 8, `library-page.test.ts` · AC-8 UI 10, 11, `library-lists.test.ts` · AC-9 UI 7 to 9, `mark-next-watched-button.test.tsx` · AC-10 UI 11, 12 · AC-11 UI 8 · AC-12 UI 10 · AC-13 UI 13, `movie-page.test.ts` · AC-14 UI 13, pgTAP 050 · AC-15 UI 14 · AC-16 UI 15 · AC-17 UI 16, `library-section.test.tsx` · AC-18 UI 12, 17, 18 · AC-19 mapping command · AC-20 pgTAP 160 · AC-21 request scope scan · AC-22 build · AC-23 `AGENTS.md`, spec notes · AC-24 timing table
