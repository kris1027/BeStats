# Spec 0020 review fixes

## Goal

Fix every finding from the two-axis review of `feat/progress-based-library-pages` against `main` (standards axis and spec axis, 2026-10-07), on the same branch, before the PR is opened. Nothing ships to the cloud: the expand migration is still unpushed (`verify.md`, Rollout), so it is edited in place rather than followed by a new migration.

> Correction during rollout: the expand migration had in fact been pushed already (the Rollout checkbox was stale). It was restored byte for byte, and the helpers and the two function rewrites moved to the new migration `20261007130000_legacy_status_helpers.sql`.

## Inspected

- `lib/tv/library-page.ts` and `library-page.test.ts` (classifier, fallback branch at lines 107-113, `airedPlaces` at 152-178)
- `lib/tracking/library-lists.ts` (both tab pipelines, three `TmdbError` catches, `showCard` switch)
- `lib/catalog/movie-page.ts`, `components/library/types.ts` (three copies of the page union)
- `app/shows/actions.ts` (`runEpisodeWrite`, `showTrackedFrom`, three `outcome.ok ? { ok: true } : outcome`)
- `components/library/library-section.tsx` (603 lines), `show-cards.tsx`, `watchlist-show-card.tsx`, `held-show-card.tsx`, `ids.ts`
- `supabase/migrations/20261007120000_show_tracking_expand.sql`, `supabase/schemas/05-functions.sql`
- `supabase/tests/070-movie-restore-functions.test.sql`, `160-show-tracking.test.sql`
- Spec `docs/specs/0020-progress-based-library-pages/index.md` (AC-1, AC-5, AC-7, Build plan steps 1 and 8), `verify.md`

## Skills used

`supabase-postgres-best-practices` (helper functions, grants, pgTAP), `supabase` (local stack, `db reset`, `db:types`), `next-dev-loop` (runtime check of the three tabs).

## Decisions and assumptions (recommended; say No to change any)

1. **AC-1 and AC-21 stay open in this PR.** The contract migration is Build plan step 8, a follow-up PR after production is verified. Dropping `tv_status` now would break the rollback path the expand migration exists for. Fix: the PR description and `verify.md` say plainly that both ACs close with the contract PR.
2. **Special fallback (spec finding c1): code changes, spec line clarified.** When the last aired episode is a special and no regular episode is known to have aired:
   - a regular `next_episode_to_air` dated after today puts the show on **Upcoming (dated)**, checked before the fallback, so Mark watched is never offered for an unaired episode;
   - otherwise the first unwatched episode of an undated season puts it on **Watchlist**, as today;
   - if every listed episode is already watched, it goes on **Upcoming (Date TBA)**, never Watched. The spec says "Watchlist", but Watchlist needs an episode to offer; Upcoming is the only page that can honestly say "we can't tell yet". AC-7's edge case line is amended to say so.
3. **Boundary season counted past its listed count (spec finding c2): keep the code, amend AC-7.** TMDB itself says that episode aired, so counting it is the truthful reading of cache skew. AC-7's "missing from the seasons list" edge case widens to "missing from the list, or listed with a count below the boundary episode".
4. **AC-5 tracks only on a first regular watch (spec finding c3): keep the code, amend AC-5.** A special never places a show (section 7), and re-marking after Stop tracking should not silently undo the user's choice. AC-5 gains: "Only a mark that newly watches a regular episode tracks the show; a special, or a mark that changes nothing, leaves it untracked."
5. **Migration mapping test (spec finding a2).** The backfill's two `case` mappings move into two immutable SQL helpers, `public.legacy_hold_for_status(tv_status)` and `public.legacy_status_for_hold(show_hold)`. The backfill uses the first; `set_show_hold` and `restore_show_tracking` use the second, which also removes the duplicated CASE (standards finding). Execute is revoked from `public`, `anon` and `authenticated`, and both are on the contract migration's drop list. A new `supabase/tests/165-show-status-mapping.test.sql` pins all five statuses, both holds, and the `tracked_at` / `hold_changed_at` choice on seeded old rows by running the backfill statement's column expressions through the helpers.
6. **pgTAP 070 (spec finding a3).** Add assertions that `restore_movie_watched` restores the watched time and leaves `in_watchlist` and `watchlisted_at` as they were (AC-14).
7. **`show_started` keeps its name.** The app deployed before spec 0020 reads that column, so renaming it breaks rollback. It is renamed in the contract migration; the TypeScript reader `showTrackedFrom` already carries the honest name. This finding is recorded, not fixed.
8. **`getTvShowsSettled` / `getMoviesSettled` stay** (Middle Man finding). They are the `lib/tmdb` public seam, and inlining them would export `readEachSettled` and its cache internals to callers. Recorded, not fixed.
9. **Standards fixes, all in this PR:**
   - Stale comments: `newly_marked` in the expand migration and `05-functions.sql` no longer cites the deleted completion check; the spec 0015 functions kept for rollback get a one-line "legacy until the spec 0020 contract migration" note.
   - `runEpisodeWrite` becomes `runTrackingWrite`; the three `outcome.ok ? { ok: true } : outcome` become one `withoutValue(outcome)` helper.
   - One `LibraryList` union in `lib/catalog/library-list.ts`; `MoviePage`, `ShowTab` and `components/library/types.ts` use it.
   - `ShowTabCard` becomes `ShowPage` plus `showId` and `title` (discriminant `page`), plus `{ page: "missing" }`, so the `showCard` switch disappears.
   - `getShowLibraryTab` and `getMovieLibraryTab` share one `classifyTab` pipeline (cap, settled read, missing on Watchlist only, sort, page), and the three `TmdbError` catches share one `settledTmdbRead` helper.
   - Both tab readers take one `LibraryTabQuery` object (`userId`, `tab`, `page`, `today`).
   - `classifyMovie`'s date decision is reused: `movie-page.ts` exports `upcomingReleaseDate(releaseDate, today)`, and the reader stops calling `airStatus` again.
   - The watched set uses a branded `EpisodeKey` string type made only by `episodeKey`.
   - One `showCardLink(showId)` helper in `components/library/ids.ts` returns `{ href, linkId }` for the four show cards.
   - `library-section.tsx` splits into `show-library-tab.tsx`, `movie-library-tab.tsx` and `library-panels.tsx` (notes, empty, failed, skeleton). `LibrarySection` stays the only export the pages import. No markup or copy changes.
   - `MissingShowCard`'s `"this show"` and `"missing title"` move into `HELD_SHOWS_COPY`.

## Expected files

- `lib/tv/library-page.ts`, `lib/tv/library-page.test.ts`
- `lib/catalog/library-list.ts` (new), `lib/catalog/movie-page.ts`, `lib/catalog/movie-page.test.ts`
- `lib/tracking/library-lists.ts`, `lib/tracking/library-lists.test.ts`
- `app/shows/actions.ts`
- `components/library/types.ts`, `ids.ts`, `library-section.tsx`, `show-library-tab.tsx` (new), `movie-library-tab.tsx` (new), `library-panels.tsx` (new), `show-cards.tsx`, `watchlist-show-card.tsx`, `held-show-card.tsx`, the copy module holding `HELD_SHOWS_COPY`, and affected tests
- `supabase/migrations/20261007120000_show_tracking_expand.sql`, `supabase/schemas/05-functions.sql` (and the schema file holding the backfill if any), `lib/supabase/database.types.ts` (regenerated)
- `supabase/tests/070-movie-restore-functions.test.sql`, `supabase/tests/165-show-status-mapping.test.sql` (new)
- `docs/specs/0020-progress-based-library-pages/index.md` (AC-5, AC-7 amendments, contract migration drop list), `verify.md` (AC-1/AC-21 open note)

## Requirements

- No behaviour change except the fallback in decision 2.
- No UI, copy or layout change beyond moving the two strings into the copy object.
- Every exported function added or renamed keeps a "why" JSDoc citing the spec or AGENTS.md section.

## Security considerations

- The two mapping helpers have no table access and are `security invoker` with `search_path = ''`. Nobody but the owner may execute them.
- No change to RLS, grants on tables, or the session boundary. `userId` still comes only from `requireUser()`.

## Acceptance criteria

1. A show whose last aired episode is a special, with an undated S1 and a regular next episode dated after today, is on Upcoming (dated), not Watchlist.
2. The same show with every S1 episode watched and nothing dated is on Upcoming (Date TBA), never Watched.
3. The existing "undecidable show" case still lands on Watchlist at its first unwatched episode.
4. pgTAP 165 passes and fails if either mapping helper changes.
5. pgTAP 070 asserts that the plan survives `restore_movie_watched`.
6. All the standards findings except decisions 7 and 8 are gone, and every existing test passes unchanged in meaning.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `supabase db reset` then `pnpm test:db`, `pnpm db:types:check`, `pnpm build`.

## Manual test steps

1. `pnpm dev:docker`, sign in as a test user.
2. Open `/watchlist?type=tv`, `/upcoming?type=tv`, `/watched?type=tv`, `/watchlist?type=movie`, `/upcoming?type=movie`. The same cards are on the same pages as before the change.
3. On `/watchlist?type=tv`, mark a show's next episode watched. The card moves on, and the toast and focus behave as before.
4. Pause a show from Watchlist, then Resume and Stop tracking from the Paused & dropped section, with Undo. Each works as before.
5. On a movie in Upcoming with a release date, the date pill shows; a movie with no date shows Date TBA.
