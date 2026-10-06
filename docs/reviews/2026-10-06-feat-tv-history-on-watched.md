# Review, feat/tv-history-on-watched, 2026-10-06

**Reviewed by**: Sonnet 5.5 (author on unknown)
**Scope**: 18 files (13 changed, 5 untracked), branch vs main
**Verdict**: Approve with nits

## Summary
Adds the `user_watched_entries` security_invoker view and merges Completed shows into `/watched`, with a per request show rating computed through the existing `ratingsBySeason` / `showRating`. The implementation matches spec 0019 closely: grants, ordering tie break, failure routing, no write on load, no button on show cards. No correctness or security defects found; only small maintainability and doc nits.

## Minor
### 🟡 Rating pages are not a consistent snapshot, `lib/tracking/library-lists.ts:~245`
**Problem**: `getShowRatings` pages with offset over a live table; a rating written between pages can shift rows so one is skipped or repeated, and the loop trusts the first `count`.
**Why it matters**: A rare, self correcting wrong decimal on a badge for a show with more than 1,000 rated episodes while the user rates elsewhere. Same pattern already accepted in `getShowEpisodeRatings`.
**Suggested fix**: Accept and note it, or keep as is for parity; no action required for this PR.

## Nits
- ⚪ `components/library/library-section.tsx` (nextEpisodes loop), `if (list !== "watchlist") break;` inside the loop reads oddly; guard the whole loop with `if (list === "watchlist")`.
- ⚪ `docs/specs/0019-tv-history-on-watched/verify.md`, records 1,866 tests; current run is 1,875. Refresh the count.
- ⚪ `supabase/migrations/20261006120000_watched_entries_view.sql`, copy of the schema file by hand; fine per repo practice, but confirm `supabase db diff` is clean before `db push`.

## Strengths
- View follows the `user_watchlist_entries` pattern exactly: `security_invoker`, anon/public/authenticated revoked, select only, pinned by pgTAP including cross user and write denial.
- Rating rule stays in one place (`lib/tv/ratings.ts`), unrounded until display, null never becomes "Not rated" or zero; a failed rating read shows the list panel instead of unbadged cards.
- `moveFocusFrom` rewrite handles buttonless missing show cards; tests cover it, and a source level test pins that `/watched` holds no write.
- AC-15 measured (about 2 ms) before deciding against the extra index.

## Test coverage
Good. `getWatchedPage` (merge order, ties, null rows, past the end, failures), `getShowRatings` (paging, caps, specials, precision, failures), grid focus and no button behavior, section copy and failure routing, and pgTAP 150 (union, sort time, status filter, isolation, grants, security_invoker) are all covered. No untested new logic found.
