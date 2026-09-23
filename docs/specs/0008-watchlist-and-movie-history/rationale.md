# 0008. Watchlist and movie history: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

Spec 0007 lets a signed in user plan, mark watched and rate a movie from its page and from the `/movies` grid, but nothing shows those lists back. The artboards `desktop-watchlist-page.svg`, `desktop-watched-page.svg` and their mobile twins draw two poster grids. The watchlist card carries the amber TMDB rating and the green Planned bookmark. The watched card carries the cyan personal score. The watchlist artboard also shows TV shows with Next episode and Stop watching badges. Those belong to feature 14; this feature is movies only.

Postgres holds only private state (spec 0001): no titles, posters or years. A list page therefore needs the user's rows from Postgres and the titles from TMDB, which has no bulk lookup by id. Spec 0001 flagged this as a real N+1 risk (one extra request per row) and deferred the question of storing snapshot columns to this feature.

`user_movie_state` records when a movie was watched (`watched_at`) but not when it was planned. `created_at` is the first time any state was stored, and `updated_at` moves with every rating or unwatch, so neither gives a stable "newest planned first" order. Removal from a list also needs a recovery path for a mistaken tap. Restoring the exact prior state requires the old position and the old watched date, and a plain unplan or unwatch erases both.

The navigation is the other half. `desktop-navbar-signed-in.svg` draws Watchlist, Upcoming and Watched links. `mobile-navbar-signed-in.svg` draws the avatar and a menu button. `mobile-menu-open.svg` draws the sheet holding the links, the account row and Sign out. Spec 0005 left `MobileMenuSheet` unwired, and the current mobile bar shows a Sign out button that the artboard does not draw. Upcoming belongs to feature 15. No artboard draws an active link state, a loading, empty or error state, or a removed card.

## Options considered

### Option 1: Server rendered pages reading a Postgres page, then cached TMDB titles; a trigger owned plan time; restore functions for Undo

Each page is a Server Component. It reads 20 rows with an exact count from an indexed, ordered query, then resolves those 20 ids through the existing `fetchMoviesByIds` with the cached `getMovie`. A new `watchlisted_at` column, maintained only by a trigger and kept on unplan, gives a stable order and lets a restore function put a movie back in its place. A second restore function puts back a watched date that the page already rendered.

**Pros**:
- No catalog data in Postgres, so no refresh policy to own, which is consistent with spec 0001.
- Every page costs a bounded number of TMDB reads, and warm pages cost none, because `getMovie` is cached for days.
- The database guarantees the order for every write path, present and future.
- Undo is exact and cannot be forged beyond the user's own row.

**Cons**:
- A cold page costs up to 20 TMDB reads.
- A trigger with a transaction local escape hatch is less obvious than plain code.
- One client supplied timestamp (the watched date on Undo) is stored.

### Option 2: Snapshot title, poster and year columns in Postgres

Store a copy of the title metadata on each row when it's written, and render lists from Postgres alone.

**Pros**:
- One query renders a full page, however cold the TMDB cache is.
- Sorting by title becomes possible.

**Cons**:
- The copies go stale, so a refresh policy and a job to run it become permanent work.
- Existing rows need a backfill from TMDB.
- It mixes catalog data into private tables, which spec 0001 deliberately avoided.

### Option 3: Client fetched lists through a Route Handler

Serve the list as JSON from a Route Handler and render it in a Client Component.

**Pros**:
- Removal and Undo could update the list without a server render.

**Cons**:
- It adds a second data path beside the Server Components every other page uses.
- The page would have no server rendered content, and it adds a fetch waterfall after hydration.
- It duplicates the auth and error handling `runTrackingWrite` already centralises.

### Undo sub decision: how the original position comes back

Three ways were weighed. Undo as plain re-planning is the simplest, but the movie jumps to the top. Having the client send back the original `watchlisted_at` is exact, but lets a client choose any sort time. Keeping `watchlisted_at` on unplan and having a restore function reuse it is exact, and trusts the client with nothing. The third was chosen. For the watched date, the stored value is erased by design (`watched_at` null means not watched), so the client sends back the rendered time. That's bounded to the past, to the caller's own unwatched row, and to a 10 minute window.

## Rationale

Option 1 fits the forces in Context without adding infrastructure. The N+1 concern that spec 0001 deferred is bounded rather than removed: paging at 20 caps the reads per request, `mapWithConcurrency` caps them at 8 in flight, and the days long `getMovie` cache makes a revisited page free. Option 2 would remove the cold cost, but it trades a latency problem nobody has measured for a staleness problem that never ends. It also stays available as a purely additive migration if the verify timing shows it's needed. Option 3 would split the app into two data paths for no user visible gain, since `runTrackingWrite` already calls `refresh()` and the server list is the source of truth.

The order column is owned by a trigger for the same reason `updated_at` is: a rule every write path must remember is a rule some future path will forget. Spec 0007 already has three writers of `in_watchlist` (the upsert, the update and `mark_movie_watched`), and feature 14 will add more tracking writes. Keeping the value on unplan, instead of clearing it, costs nothing (it means nothing while unplanned) and is what makes an exact, server trusted Undo possible. The 10 minute window, measured from `updated_at`, stops Undo from becoming a general "set my plan time" feature while leaving plenty of time for a toast.

The engineer chose to have removed cards disappear immediately, with a toast Undo, over leaving them in place with a flipped button. That makes the page an exact list at all times, and the Undo design above carries the safety a stay in place card would otherwise give. The engineer also chose a `glass-selected` pill for the active link, and an unmark control on watched cards that the artboard does not draw. Both reuse existing pieces (`glass-selected`, `WatchedIcon`, the round card button), so no new visual language is introduced. Hiding Upcoming until feature 15 avoids a link to a page that does not exist.

A malformed `page` parameter follows the soft "That page doesn't exist" state that `/movies` already uses through `parsePageParam`, rather than a hard 404. A streamed page has already sent 200 by the time it parses, and the proxy's 404 rule covers only movie ids. The pages are private and `noindex`, so a soft state costs nothing there.
