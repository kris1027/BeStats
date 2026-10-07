# Review, feat/progress-based-library-pages, 2026-10-07

**Reviewed by**: Sonnet 5.5 (author on Sonnet 5.5)
**Scope**: 112 files plus 3 untracked test files, branch vs main
**Verdict**: Approve with nits

## Summary
This change replaces the five stored show statuses with a tracked row and an optional Pause or Drop. Each tracked show is now placed on Watchlist, Upcoming or Watched on every request by a pure function, and movies follow the same one page rule. The SQL, the server actions and the classifiers match spec 0020 closely, and ownership is enforced both in the actions and in the database. I found no blockers or majors, only a few performance and tidiness points. `pnpm typecheck` passes and 559 vitest tests across the touched areas pass. I did not run `pnpm test:db`, so the pgTAP suite is unverified by me.

## Minor
### 🟡 Unbounded parallel page reads for a long history, `lib/tracking/library-lists.ts:388`
**Problem**: `readWatchedRegular` reads the first page, then fires every remaining page at once with `Promise.all(offsets.map(query))`. A user with 500 shows and a large history (for example 50,000 watched episodes) sends about 50 requests in parallel, on every tab render. The `.in("show_id", showIds)` filter on line 371 also puts up to 500 ids in one GET URL, about 4 KB.
**Why it matters**: A heavy account can hit connection limits or a URL length limit on the proxy, and the page then shows the failed panel for a healthy list. Each of the three tabs repeats the work.
**Suggested fix**: Read the pages with a small concurrency limit (the TMDB module already has a helper for this), or sum the episodes in SQL. Keep the id list bounded or chunk it.

### 🟡 Nullable hold hidden behind a cast, `app/shows/actions.ts:596`
**Problem**: `input.hold as ShowHold` and `input.expected as ShowHold` (also line 625) pass `null` to the RPC while the type says it cannot be null.
**Why it matters**: The cast defeats the generated types for exactly the argument that carries the stale hold guard. If the types are regenerated with different nullability, the compiler will not notice.
**Suggested fix**: Mark these RPC arguments as nullable in the generated or wrapper types and drop the cast.

### 🟡 Tracking view aggregates every episode before the 500 limit, `supabase/migrations/20261007120000_show_tracking_expand.sql:551`
**Problem**: `user_tracked_shows` groups all of the user's watched episodes per show, and the 501 limit is applied only after the aggregation. The ceiling is meant to bound work before any TMDB read, but it does not bound this query.
**Why it matters**: Fine for normal users, but cost grows with total watched episodes on every library tab request. It is read three times per media type visit.
**Suggested fix**: Accept it for now and record it in the verify notes, or add a timing check with a large seeded account (AC-24 only covers 100 shows).

### 🟡 Specials never track a show, `supabase/migrations/20261007120000_show_tracking_expand.sql:385`
**Problem**: The three episode functions track the show only when `p_season_number >= 1`. AC-5 says marking "an episode or a season" tracks an untracked show, with no special case.
**Why it matters**: Marking only a special watched leaves the show untracked, which is a quiet difference from the written criterion. It is sensible (a special never places a show), but undocumented.
**Suggested fix**: Say so in AC-5 or the function comment, or track on specials too.

## Nits
- ⚪ `lib/tracking/library-lists.ts:374`, the watched set is keyed by stored season and episode numbers, while the hero progress matches by TMDB episode id. A renumbered episode can differ between the two. Worth a one line note.
- ⚪ `components/library/held-show-card.tsx:164`, the stop button for a missing show uses the literal name "this show" and "missing title" in labels, which screen readers hear. Fine, but inconsistent with the named card.

## Strengths
- `lib/tv/library-page.ts` is small, pure and handles the awkward cases in the spec (special as last aired episode, cache skew, malformed fields, undated next episode) with a matching test file.
- The database side is careful: every new function is `security invoker` with an empty `search_path` and `anon` revoked, `user_id` always comes from `auth.uid()`, hold changes lock the row and compare the expected hold (`BS409`), and the restore function bounds the client supplied times. Triggers own `tracked_at` and `hold_changed_at`, so no client can write them.
- Server actions parse with Zod, check the session, never take a user id from the client, and return results instead of throwing. The pgTAP suite includes cross user cases and direct function calls.
- Per title TMDB failures are kept separate from systemic ones, so one bad show does not blank a page and a credential failure is not hidden.

## Test coverage
Good. New logic has colocated tests: `lib/tv/library-page.test.ts`, `lib/catalog/movie-page.test.ts`, `lib/tracking/library-lists.test.ts`, `schemas.test.ts`, `app/shows/actions.test.ts`, component tests for the new cards and controls (including the three untracked files), and `supabase/tests/160-show-tracking.test.sql` for the database. Gaps: no test for the many page history path in `readWatchedRegular`, and no scale check beyond AC-24. I ran typecheck and the vitest suites for components/library, lib/tv, lib/catalog, lib/tracking and app/shows (all pass); I did not run `pnpm test:db`.
