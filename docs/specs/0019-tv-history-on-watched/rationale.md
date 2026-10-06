# 0019. TV history on /watched: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md` and can skip this file.

## Context

`/watched` (spec 0008) pages over `user_movie_state` rows with a `watched_at`, newest first, 20 a page with an exact count, and joins each page with cached TMDB titles. Spec 0013 left TV out on purpose: there was no artboard for shows and no scope row. Scope feature 21 now asks for `/watched` to be the whole history, so shows have to join without breaking what the page already promises: truthful counts, stable order across pages, personal ratings kept apart from TMDB's, and failure states that never pass for an empty list.

TV history is shaped differently from movie history. A movie has one watched mark and one time. A show has many episode rows, each with its own time and optional rating, plus a separate status row, and `AGENTS.md` keeps status and episode history independent. So "which shows count as watched" and "when did a show happen" are real product choices, not facts the data already answers. The engineer chose: only Completed shows, sorted by their newest watched episode (specials included), falling back to when they became Completed.

The show's personal rating is not stored anywhere (`AGENTS.md` section 8). It is derived from episode ratings by a rule (`AGENTS.md` section 9) that already exists once, in `lib/tv/ratings.ts`, and is shared with the browser so the season header can replay clicks. A second copy of that rule anywhere else is a drift risk.

The page is private and dynamic, sits under Cache Components, and must stay read only on load: `AGENTS.md` names the only two pages allowed to write on render (`/shows/{id}` and `/upcoming`).

## Options considered

### Option 1: One ordered view, rating in TypeScript

A `security_invoker` view unions watched movies with Completed shows, each with one sort time, so the page keeps a single ordered query with an exact count. The show rating comes from one batched read of the page's rated episodes, through the existing `ratingsBySeason` and `showRating`.

**Pros**:
- Identical in shape and security to `user_watchlist_entries`, already proven by pgTAP and verify runs.
- Exact counts and stable pages come straight from Postgres, with no merging in TypeScript.
- The rating rule stays in one place.

**Cons**:
- One extra query per page with shows.
- The view aggregates episode rows per Completed show on every read; it has to be measured (AC-15).

### Option 2: View that also computes the rating in SQL

The same view, plus a show rating column: a mean of per season means, specials excluded.

**Pros**:
- One query per page, no second read.

**Cons**:
- The rating rule then exists in SQL and in `lib/tv/ratings.ts`, and the two can disagree on an edge (rounding, specials, empty seasons).
- A nested aggregate per show on every page read, even for shows the page does not display.

### Option 3: Two reads merged in TypeScript

Keep the movie read, add a Completed shows read, merge and page them in the server.

**Pros**:
- No migration.

**Cons**:
- Correct paging needs both lists read in full (or a merge cursor), so cost grows with history size, and the count is assembled by hand, the failure `AGENTS.md` section 10 warns about for search.
- Two code paths for one list, where the watchlist already settled on a view.

### Option 4: Separate Shows section or tabs

Keep the movie grid and add a Shows grid (or a tab switch) with its own pagination.

**Pros**:
- No merged ordering problem; each list keeps its natural sort.

**Cons**:
- Two paginations on one URL, or a control the artboard does not draw.
- Inconsistent with `/watchlist`, which already mixes movies and shows in one grid.

## Rationale

Option 1 matches what the codebase already does for the same problem. `/watchlist` faced "movies and shows in one paged list with a truthful count" in spec 0013 and solved it with a `security_invoker` view; reusing that shape means the paging, the past the end redirect, the RLS story and the pgTAP pattern carry over with no new ideas to get wrong. Option 3 would rebuild by hand what Postgres already gives for free, and Option 4 fights both the single grid artboard and the watchlist precedent.

The rating stays in TypeScript because the rule is the part most likely to drift. Spec 0012 put it in one pure module precisely so every surface agrees; Option 2 would save one small query (20 shows at most, an indexed read) at the price of a second implementation of a rule with several edge cases. That trade is not worth it.

The engineer chose to show only Completed shows. It keeps the page about finished things and makes status the single, visible gate, but it does mean partly watched shows are not "history" here; that is recorded as a tradeoff and a Follow-up item, not hidden. Having no button on show cards follows from the same choice: unmarking a whole show from a grid would be a mass destructive tap, and changing the status from here would mix status with history, which `AGENTS.md` keeps apart. Not running the automatic completion check here keeps `/watched` read only on load, as `AGENTS.md` asks; the cost is that a show finished on TMDB joins only after the user opens its page or `/upcoming`, which matches the deferred "scheduled automatic completion" item in the scope.

Failing the whole list when the rating read fails, rather than dropping the badge, follows `AGENTS.md` section 11: a missing badge already means "Not rated", so silently omitting it would show a false state.

## Recommendations settled at write time

- **Rating read location**: a new `getShowRatings` beside `getShowEpisodeRatings` in `lib/tracking/show-ratings.ts`, sharing its keyset paging loop (`readKeysetPages`). First placed beside `getWatchedPage` in `lib/tracking/library-lists.ts`; moved after review, because it duplicated the loop and made `library-lists.ts` reach into the show rating module. Runner up: generalise `getShowEpisodeRatings` to many shows, rejected because it is wrapped in React `cache()` keyed on one show for the show page.
- **Badge component**: `CalculatedRatingBadge` with the label "Your show rating", so a mean always shows one decimal and never shares the movie score's formatter. Runner up: `PersonalScoreBadge`, rejected because it would print `7` for a mean of 7.0.
- **No new index up front**: measure first (AC-15). Runner up: the partial `(user_id, show_id, watched_at desc)` index, kept as a Follow-up item.
- **pgTAP file**: a new `150-watched-entries.test.sql`, mirroring `110-watchlist-entries.test.sql`.
