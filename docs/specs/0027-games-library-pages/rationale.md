# 0027. Games tab and library pages: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

Signed in users can set a game's status and score on `/games/{id}` (spec 0026), but they cannot see their games anywhere else. The library routes `/watchlist`, `/upcoming` and `/watched` already serve shows and movies, picking the media type from `?type=` (feature 22). The games scope settled that these same routes carry games, with Want to play on `/watchlist`, Playing on `/upcoming` and Finished on `/watched`.

Three forces shape how. First, a game's status is stored by hand, unlike a show's page, which is worked out from episodes and air dates on every request. The show and movie tabs read up to 500 titles and classify them because they must; a games tab does not have to. Second, `MediaType` (`"tv" | "movie"`) runs through about twenty files: `/search`, the catalog landings, the proxy, the logo's memory and the copy tables. Most of those have no games version yet. The games home and list pages are G6 and game search is G7, so a value of `game` reaching them would be a dead end or a crash. Third, nothing in production links to a game page yet (spec 0025 kept it out of links and the sitemap), so a GAMES tab shipped visible would show almost everyone an empty list they cannot fill.

The library pages also carry rules this feature must keep: the heading and skeleton are a prerendered shell, `requireUser()` runs before any read, nothing writes on load, user rows never enter a shared cache, and a failure is a panel with Retry, never an empty state.

## Options considered

### Option 1: A library only type, a SQL page plus one IGDB batch, behind a flag

`LibraryType = MediaType | "game"` is accepted only on the three library routes, gated by `NEXT_PUBLIC_GAMES_LIBRARY`. Each tab reads 24 rows with an exact count, ordered by its own date, then one `getGamesByIds` for those ids.

**Pros**:
- The compiler keeps `game` out of every surface that has no games version.
- The cheapest possible read, with a truthful count and no limit note.
- Production stays clean until a way to find games exists.

**Cons**:
- Two type unions and two parsers live together for a while.
- A flag adds a variable to manage and a branch to test.

### Option 2: Widen `MediaType` to include `game`

Add `game` to the one union and give every switch over it a games branch or an explicit "not yet" rejection.

**Pros**:
- One type, one parser, and the final shape G6 and G7 need anyway.

**Cons**:
- About twenty files change now for features that do not exist yet, and each "not yet" branch is code to delete later.
- A missed branch is a runtime dead end on a public page, not a compile error.

### Option 3: Reuse the classified tab reader (up to 500 rows, one batch, slice in memory)

Mirror `getMovieLibraryTab`: read up to 500 rows per tab, one IGDB batch for all of them, slice the page in memory, and show the limit note.

**Pros**:
- The same shape as the show and movie tabs, so `classifyTab` and `TabNotes` are reused.

**Cons**:
- Up to 500 IGDB lookups per page view where 24 are shown, and a limit with nothing to justify it, since there is no classification.
- A heavy user's oldest games would fall past the limit for no reason.

### Option 4: Ship the GAMES tab visible in production now

No flag. GAMES is live at merge, and people fill it from direct `/games/{id}` links.

**Pros**:
- No flag to remove later.

**Cons**:
- Almost every user sees an empty tab with no way to fill it, which breaks the scope's rule that production never shows half a feature.

## Rationale

Option 1 follows the stored status. Since the database already knows which tab a game is on, the cheapest correct read is a page of rows with an exact count, the same shape Watched movies has used since spec 0008. Classifying up to 500 rows (Option 3) answers a question games do not ask, and its cost is an IGDB batch twenty times larger than the page.

A separate `LibraryType` (over Option 2) puts the boundary where the product boundary is. In G5 only the library routes have a games version, so only they accept `game`, and the compiler proves the rest cannot see it. G6 and G7 then widen on purpose, each with a full list of what to handle. The cost is a second union for a few features, which is small and visible.

The flag (over Option 4) keeps the scope's promise that production never shows half a feature. It follows the existing `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY` pattern, so it adds no new mechanism. Keeping the headings in the shell, showing the tab only on library pages, hiding the navbar search on games, and leaving the empty state text only all follow from one rule: no link, button or control may lead to a page that does not exist yet.

Calls made within the decision, with the runner up:
- **One `GameLibraryGrid` beside the movie grid**, sharing `card-focus.ts`, the heading focus and the toast helpers, over generalising `LibraryGrid` across media types. The game actions, Undo payload and errors differ enough that one generic grid would branch on every line. Runner up: one generic grid with a media adapter.
- **Factor the game Undo toast out of `useGameUndo` into a plain function**, since a hook bound to one `gameId` cannot serve a grid of many. Runner up: one client component per card, which would split the optimistic hide from the grid.
- **`ReleasePill` (short date or Date TBA) on an unreleased Want to play card**, over the game page's sentence (`Releases {date}`), so the badge matches the movie Upcoming card's pill. Runner up: a text line in `meta`.
- **A short month in the date line (`Finished Oct 2026`)**, which fits a two column card at 375px. Runner up: the long month.
- **The remove button uses one remove glyph for every games tab**, labelled with the game's name. Runner up: a different status glyph per tab, which would need three new marks in the icon key for a control G8 replaces anyway.
- **One `CatalogFailed({ source })` over the shared `LoadFailed`**, used for TMDB and IGDB, instead of a second copy of the panel. Runner up: a separate `IgdbFailed`.
- **A second `libraryType` field on `PageMediaType`**, beside `type`, over widening `type` itself (from the cross check). Widening would hand `game` to `NavbarSearch` and `BrandLink`, which have no games version. Runner up: a small `useGamesTab()` hook read only by the tabs and `LibraryNav`.
- **Two flag readers, throwing and not throwing** (from the cross check). The navbar renders on every page, so a typo in the variable must never take the public catalog down; only `LibrarySection` fails loudly, the `publicEnvProblems()` and `getPublicEnv()` split.
