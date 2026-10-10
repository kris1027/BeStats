# Next episode after the furthest watched

Spec: [0020](../docs/specs/0020-progress-based-library-pages/index.md), amended 2026-10-10 (AC-7, the Watchlist value row, the classifier test scenarios). Reasons: [rationale.md](../docs/specs/0020-progress-based-library-pages/rationale.md#amendment-2026-10-10-next-episode-after-the-furthest-watched). Scope feature 23. Branch `feat/next-after-furthest`.

## Goal

When a user marks S1E2 of a show but not S1E1, the Watchlist card offers S1E3, not S1E1. The card's next episode is the first aired regular episode after the user's furthest watched episode, and a show with nothing aired after that episode is caught up, whatever gaps sit behind it.

## Inspected code

- `lib/tv/library-page.ts`: `classifyShow` walks `airedPlaces` and returns the first unwatched place (lines 116 to 122); the special `last_episode_to_air` branch uses `firstUnwatched` across every listed episode (lines 133 to 139). Both are the "first unwatched" rule this changes.
- `lib/tv/library-page.test.ts`: the AC-7 unit table and the AC-8 "every watched prefix" property test. The case "finds an episode left behind when watching out of order" asserts the old rule (S1E3 offered after all of S2 is watched).
- `lib/tracking/library-lists.ts`: builds the watched set (regular episodes only) and calls `classifyShow`; unchanged.
- `components/library/watchlist-show-card.tsx`, `mark-next-watched-button.tsx`, `app/shows/actions.ts`: the card renders the `next` place and Mark watched marks that episode id; nothing re-checks "first unwatched", so no change. `markEpisodeWatched` refuses only `upcoming` episodes, so an undated episode can be the furthest watched one (decision 5).
- `lib/tv/progress.ts`: counts watched aired episodes; unchanged (decision 3).
- `AGENTS.md` section 9 states the old rule ("the card offers the first one in season and episode order").

## Skills

`next-dev-loop` (runtime check of Watchlist and Upcoming). No database change, so no Supabase skill.

## Decisions (settled in grilling, 2026-10-10)

1. The anchor is the **furthest watched** regular episode (highest season, then episode), not the most recently marked one.
2. Skipped earlier episodes stay unwatched, with no prompt; they can be marked on the show page.
3. Progress still counts only watched episodes (a gap shows 9 of 10).
4. Caught up with gaps (nothing aired after the furthest watched) → Upcoming when a next episode is dated, else Watched (Finished or Caught up).
5. Furthest watched past the last aired episode (an undated episode marked by hand) → caught up, same as 4.
6. The special `last_episode_to_air` branch uses the same anchor: Watchlist at the first listed episode after the furthest watched when it sorts before a dated next episode; Upcoming (Date TBA) when none comes after it and nothing is dated.
7. Unmarking recomputes from the new furthest: unmarking the furthest moves the card back; unmarking a gap changes nothing.
8. Nothing watched → the card offers S1E1, as today. Date boundary unchanged: today is the request's UTC date (`requestTodayUtc()`).

## Expected files

- `lib/tv/library-page.ts`: compute `furthest` once from the watched set (max by `before`); in the aired walk, return the first place that sorts after `furthest` (every place when it is null) instead of the first unwatched one; replace `firstUnwatched` with a `firstListedAfter(seasons, furthest)` helper; update the JSDoc to describe the rule and cite the amendment. The `watched.size === 0` check for Date TBA stays.
- `lib/tv/library-page.test.ts`: rewrite the out of order case and add the new cases listed under Automated checks.
- `AGENTS.md` section 9: "Watchlist: an aired regular episode comes after the furthest one you watched, and the card offers the first of them with Mark watched." Upcoming and Watched sentences say "caught up" already and stay.
- `docs/specs/0020-progress-based-library-pages/index.md` and `rationale.md`: amended on this branch (done, not yet committed; the file also carries the earlier uncommitted Status: Accepted change).

No migration, no new route, no UI or copy change, no new dependency.

## Requirements

- `classifyShow` stays pure and synchronous: the same details, watched set and day give the same page (spec 0020 key invariants). No timestamps are read.
- Every tracked show is still on exactly one page (AC-8); the property test over watched prefixes keeps passing.
- Specials never enter the watched set or the anchor (already true in `library-lists.ts`).
- No page writes when it loads (AC-21); nothing is stored.

## Security considerations

None new. The change is a pure function over data the page already reads under the user's session; no new input, query, cache or credential. The Mark watched action keeps its own validation and `requireUser()`.

## Acceptance criteria

1. Watched S1E2 only, aired through S2E3 → Watchlist, next S1E3.
2. Watched S1E2, then also S1E1 → next still S1E3.
3. Watched all of S2, S1E3 and S1E4 not, last aired S2E3 → Watched, Caught up (Finished when Ended).
4. Same as 3 with `next_episode_to_air` dated tomorrow → Upcoming at that date.
5. Furthest watched is an undated S3E1 past last aired S2E3 → caught up (Watched or Upcoming by the dated rule).
6. Watched S1E1 to S1E3, unmark S1E3 → next S1E3; unmark S1E2 instead → next stays S2E1.
7. Special `last_episode_to_air` with an undated season: watched S1E2 only → Watchlist S1E3; every listed episode at or before the furthest → Upcoming (Date TBA) when nothing is dated.
8. Nothing watched, aired → Watchlist S1E1 (unchanged).
9. Progress for case 1 reads 1 of the aired total, not 2.

## Automated checks

- `pnpm test lib/tv/library-page.test.ts`: the cases above as unit tests (1 to 8), plus every existing case still green; the out of order case rewritten to case 3.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (full suite).
- No build needed by the rule (no route, config or dependency change), but I'll run `pnpm build` anyway since server code changes.

## Manual test steps

1. `pnpm dev:docker`, sign in with a test user.
2. Open a show with at least two aired seasons that you don't track, e.g. `/shows/1399`. Mark S1E2 watched only (the show becomes tracked).
3. Open `/watchlist?type=tv`: the show's card offers **S1E3**.
4. Back on the show page, mark S1E1. Reload `/watchlist?type=tv`: the card still offers **S1E3**.
5. Click Mark watched on the card: it moves to **S1E4**.
6. On the show page, mark the last aired episode of the show. Reload Watchlist: the show is gone; it is on `/watched?type=tv` (Finished for an ended show) or `/upcoming?type=tv` when a next episode is dated, even though S1 has gaps.
7. On the show page, the progress still counts only the episodes you marked.
8. Unmark the last aired episode: the show returns to Watchlist, offering that episode.
