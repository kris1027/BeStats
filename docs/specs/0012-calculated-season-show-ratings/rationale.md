# 0012. Calculated season and show ratings: decision record

The build spec is [index.md](index.md). This file holds the context, the options weighed and the reasoning, which `/develop` does not need to build.

## Context

Feature 12 (spec 0011) lets a signed in user score TV episodes from 1 to 10 and stores each score in `user_episode_state.rating`. `AGENTS.md` sections 7 and 9 forbid rating a season or a show directly: both must be calculated from the user's episode scores. A season is the mean of its rated episodes; a show is the mean of its rated regular seasons, each with equal weight; Specials (season 0) and unrated seasons are excluded; precision is kept until display, which is one decimal; no ratings means "Not rated", never zero. `AGENTS.md` section 8 also forbids storing rounded season or show ratings as editable values.

The forces are mostly about consistency and cost. The same rule must give the same answer everywhere it appears (season header, season cards, show page, and later the TV watchlist and Up Next), including while an optimistic click is pending on the season page, where the client already replays pending episode intents through `applyEpisodeIntent`. The season page already reads every rating it needs in one query (spec 0011, AC-18). The show page reads no session today and knows only the season list from TMDB, not each season's episode ids; getting those needs one TMDB request per season (or batched `append_to_response` calls of up to 20), which is heavy for long running shows.

A smaller force is display rounding. Averages of integers are rational numbers, and binary floating point turns some exact ties (`8.05`) into values just below the tie, so naive `toFixed(1)` can show `8.0` where a person expects `8.1`. The existing `formatPersonalScore` also prints whole numbers without a decimal, which is right for an explicit score but wrong for a calculated one.

Not deciding leaves `/develop` to choose where the math lives, which rows count, where the numbers appear, and how they round, each of which changes what the user sees.

## Options considered

### Option 1: Pure TypeScript rules over stored rows, computed at read time

`lib/tv/ratings.ts` takes plain `{ seasonNumber, rating }` values and returns the season and show means. The season page feeds it from its existing read plus pending intents; the show page from one new read of rated rows for the show.

**Pros**:
- Matches `AGENTS.md` section 5, which puts business rules in reusable domain functions; trivially unit tested with the section 9 example.
- The optimistic season header can call the exact same function the server uses, so no second implementation to keep in sync.
- No migration, no new grant surface, no pgTAP for new functions.

**Cons**:
- Every rated row for the show crosses the wire to compute one number (a few hundred small rows at most, but more than one aggregate row).
- A future consumer outside Next.js (a SQL report, another client) would have to reimplement the rule.

### Option 2: A `SECURITY INVOKER` Postgres function returning the aggregates

`public.show_ratings(p_show_id)` returns one row per season with its mean and count, and the show mean, computed with `avg(avg(...))` style SQL under RLS.

**Pros**:
- Only aggregates travel; the database does the grouping close to the data.
- One authoritative implementation for any client of the database.

**Cons**:
- The optimistic season header still needs a TypeScript version, so the rule exists twice and must be tested case for case in both, the burden spec 0011 already carries for `episode_intent`.
- Adds a function, its grants carried into the migration by hand (the trap spec 0007 documents) and pgTAP for it.
- Postgres `avg` on integers returns `numeric`, which PostgREST sends as a string or number depending on settings, one more conversion to get right.

### Option 3: A `security_invoker` view of per season means

A view `user_season_ratings` groups `user_episode_state` by user, show and season and exposes the mean and count; the show mean is computed from the view in TypeScript.

**Pros**:
- Queryable with the ordinary Supabase client and typed by `pnpm db:types`.
- Keeps the per season grouping in SQL, where it is easy to inspect.

**Cons**:
- Splits the rule across SQL (season) and TypeScript (show), the worst of both for review.
- Still needs the TypeScript season mean for the optimistic header.
- A view must be created with `security_invoker = true` or it bypasses RLS, an easy mistake with a serious privacy cost.

### Option 4: A stored projection maintained by a trigger

A `user_season_rating` table updated by a trigger on `user_episode_state`, read directly by every page.

**Pros**:
- Constant time reads, no grouping on any page view.
- Ready for sorting or filtering by rating in SQL later.

**Cons**:
- `AGENTS.md` section 8 allows a projection only if needed and consistently maintained; nothing measured needs it, and the data sizes are tiny.
- A trigger bug or a missed path silently drifts the stored number from the episode scores, exactly the stale value problem.
- Adds a table, RLS policies, a trigger and backfill logic for no user visible gain.

### Sub decision: which rows feed the show page

- **A. Stored rows grouped by stored `season_number` (chosen).** One indexed query. Episodes TMDB later deletes or renumbers keep counting under their old season until the user clears that rating.
- **B. Only episodes TMDB still lists.** Matches the season page exactly, but needs every season's episode list from TMDB on each show page view: one to several cached upstream calls per show, and a TMDB outage would hide the rating.
- **C. Stored rows everywhere, season page included.** Always consistent between pages, but brings orphaned rows back into the season header, contradicting spec 0011, AC-25.

### Sub decision: rounding for display

- **Half up with a `1e-9` tolerance on floating point means (chosen).** A few lines, fixes the binary tie cases (`8.05`, `7.95`), easy to test.
- **Exact rational arithmetic with `BigInt`.** Mathematically exact, but carrying numerator and denominator through two levels of averaging is more code than a one decimal display warrants.
- **Plain `toFixed(1)`.** Simplest, but shows `8.0` for an exact `8.05` average, which users would read as a bug.

## Decision

Option 1, with row source A and half up rounding with tolerance. The ratings appear in the season header, on each season card, and beside the Seasons heading on the show page; the show hero stays free for feature 14's status control.

## Rationale

The deciding force is the optimistic season header. Spec 0011 already replays pending clicks in the browser, and the season rating must move with the score pill. Any option that puts the rule in SQL still needs a TypeScript copy for that, so options 2 and 3 double the rule for no gain at this data size, and option 4 adds a whole maintained table that `AGENTS.md` section 8 permits only when needed. A pure module is the single implementation every surface and the optimistic path share, which is exactly what `AGENTS.md` section 5 asks for, and computing at read time means the number can never drift from the scores behind it.

For the show page source, the engineer chose the cheap, stored row path (A) over a TMDB backed filter (B). The mismatch it allows needs TMDB to delete or renumber an episode the user rated, which is rare, and the cost of B is several upstream calls on every show page view plus a hidden rating during TMDB outages. The divergence is documented in Consequences and has a Follow-up to revisit if it is ever seen.

On placement, the engineer chose the season header, the season cards and the Seasons heading row over the hero. That keeps the rating next to the season cards that explain it (each card shows the season means the show rating averages), and leaves the hero's reserved place to feature 14's status control. The "Label plus basis" copy and the "Specials not included" note address the one place the equal weighting and the Specials rule could otherwise look arbitrary.

Rounding: a tolerance based half up rounding is the smallest change that makes displayed values match what a person computing the average by hand expects; exact rationals were the runner up and remain a drop in replacement inside `formatCalculatedRating` if a real case ever needs them.
