# Scope: BeStats Games

A third media type next to shows and movies. Anyone can browse and search a games catalog powered by IGDB; signed in users keep a private list of games they want to play, are playing, and have finished, with their own ratings.

**Build approach:** Tracer Bullet (prove the whole pipe works with one thin real thread, then thicken one strand at a time, always end to end).
**Workflow:** Beta (after develop, run `/check verify` then `/test`), the same default as [scope.md](scope.md). Features that hold private data or enforce the status and rating rules carry a `· GA` tag, which adds a fresh model review and `/document`. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

_This is the second scope for BeStats. The movie and TV scope lives in [scope.md](scope.md) (features 1 to 25); games features are numbered G1 onward so the two never collide. The stack, tooling and the shared rules (security, caching, the UI reference) stay in `AGENTS.md`. Until the G1 and G2 specs add them there, the games rules below are the source: they were settled in a grilling session on 2026-10-17._

## Settled decisions (2026-10-17)

- **Catalog source:** IGDB, read only from the server with Twitch app credentials that never reach the browser, in batches of up to 500 ids, mirroring the TMDB module. BeStats stays non commercial; IGDB and Twitch are credited in the footer and on `/terms`, not listed as processors (they never receive user data). IGDB's current terms get checked again before launch.
- **Catalog filter:** main games, remakes, remasters, expanded games and standalone expansions only. DLC, bundles, mods, seasons and episodes are hidden, and so is the Erotic theme, the way adult movies are.
- **Statuses, set by hand:** Want to play, Playing, Finished. Unlike shows and movies, nothing is worked out from progress (a game has no episodes). One row per user and game; you can move between any two statuses in one click; removing the game deletes the row, with Undo. No Dropped or Paused status.
- **Release gate:** before its first release date (UTC day, IGDB `first_release_date`, global), a game can only be Want to play; Playing, Finished and a rating are disabled with a "Releases {date}" or "TBA" hint. The database cannot know the date, so the Server Action checks it, the same split as movies.
- **Ratings:** your own score from 1 to 10, allowed only on Playing or Finished. Moving back to Want to play clears it, with Undo that restores the status, score and timestamps. Moving between Playing and Finished keeps it. IGDB's community rating (out of 100) shows out of 10 and is always labelled as the community rating.
- **Timestamps:** added, started (the first time a game becomes Playing) and finished (every time it becomes Finished). Want to play sorts by added, Playing by started, Finished by finished, and a Finished card reads "Finished {month year}". A game set straight to Finished has no start date.
- **Not tracked in this pass:** which platform you play on, hours played, 100% completion.
- **Navigation:** the navbar becomes SHOWS | MOVIES | GAMES with `?type=game`. The library routes stay; for games `/watchlist` reads Want to play, `/upcoming` reads Playing, `/watched` reads Finished. The GAMES tab stays hidden until G5 ships, and game pages reach the sitemap only in G10, so production never shows half a feature.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| G1 | IGDB integration module | Foundation | in-progress |
| G2 | Game data model and security policies | Foundation | in-progress |
| G3 | Game page (tracer) | Slice G1 | planned |
| G4 | Game status and rating | Slice G1 | planned |
| G5 | Games tab and library pages | Slice G2 | planned |
| G6 | Games home and list pages | Slice G3 | planned |
| G7 | Game search and filters | Slice G4 | planned |
| G8 | Game cards everywhere | Slice G4 | planned |
| G9 | Richer game page | Slice G5 | planned |
| G10 | Games launch | Slice G6 | planned |

## Foundations

### G1. IGDB integration module · in-progress
A server only module that reads games from IGDB, the way `lib/tmdb/` reads movies and shows, so every later games feature has one trusted source.
**Done when:** the Twitch app token is fetched and cached on the server until it expires; game details, lists and search come back normalized with the catalog filter applied; up to 500 ids load in one batched request and each game's details are cached for a few hours; rate limit (4 requests a second) and failed requests return a plain result the UI can show; the `IGDB_*` variables are in `.env.example`, a boundary test fails if any other file reads them or gives them a `NEXT_PUBLIC_` prefix, and a live check script runs against real IGDB; the games rules above are added to `AGENTS.md`.
- [x] Design it (spec): `/architect IGDB integration module`
- [x] Build it: `/develop IGDB integration module`
  - [x] Credentials, the boundary test and the thin live thread (token, client, `getGame`) with the IGDB facts gate run against real IGDB, AC-1 to AC-3, AC-5, AC-9, AC-18
  - [x] Hardened client: typed errors and results, retries, 401 refresh, limiter with bounded waits, failure logging, AC-4, AC-6, AC-7, AC-17
  - [x] Full `Game` normalization, the catalog filter with its parity test, and the 500 id batch, AC-9 to AC-11, AC-15, AC-16
  - [x] Search, discover, validation and the reference lists, AC-5, AC-12, AC-12b, AC-13, AC-14
  - [x] Cache lifetimes, the entry point surface test, the full fixture suite, and the AGENTS.md updates, AC-8, AC-19 to AC-21
- [x] Verify it: `/check verify IGDB integration module`
- [x] Test it: `/test IGDB integration module`
spec [0023](../specs/0023-igdb-integration-module/index.md) · code in [lib/igdb/](../../lib/igdb/)

### G2. Game data model and security policies · in-progress · GA
The private table behind every games feature: one row per user and game holding its status, score and dates.
**Done when:** a migration adds the table with a status enum, one row per user and game, a score from 1 to 10 that needs Playing or Finished, and the three timestamps; owner only RLS covers read, insert, update and delete; pgTAP tests prove two users cannot read or change each other's games; generated types are updated.
- [x] Design it (spec): `/architect game data model and security policies`
- [x] Build it: `/develop game data model and security policies`
  - [x] Thin thread: enum, table, forced RLS, owner policies, hardened grants, seed rows, cross user pgTAP cases and regenerated types, AC-1, AC-9 to AC-11, AC-14
  - [x] Score and status checks, AC-2, AC-3
  - [x] Trigger owned dates with the identity pin and the restore escape, and their tests in `180-game-state.test.sql`, AC-4 to AC-8
  - [x] Structure and sweep tests, drift check and type checks, then `supabase db push` before merge, AC-12 to AC-15
- [x] Verify it: `/check verify game data model and security policies`
- [x] Test it: `/test game data model and security policies`
- [x] Review it (fresh model): `/check review game data model and security policies`
- [x] Document it: `/document game data model and security policies`
spec [0024](../specs/0024-game-data-model-security/index.md) · code in [supabase/](../../supabase/)

## Slice G1: One game, end to end

### G3. Game page (tracer) · needs a decision
The thinnest real `/games/{id}`: hero only (cover, title, release date, platforms, genres, IGDB rating), proving IGDB data reaches a shipped page.
**Done when:** a valid id renders the hero from cached IGDB data with missing values omitted; the proxy answers a malformed id with a real 404 and an unknown or hidden id gets the soft 404; `images.igdb.com` is allowed with its own loader; the shell stays prerendered; loading, error and missing image states work at 375px and 1280px.
- [ ] Design it (spec): `/architect game page`

### G4. Game status and rating · needs a decision · GA
The segmented control (Want to play · Playing · Finished) and the score on the game page, saved through Server Actions.
**Done when:** a signed in user can set any status, remove the game by clicking the active option, and rate it 1 to 10 on Playing or Finished; every change survives reload and another session; the release gate disables Playing, Finished and rating before release, also in the Server Action; moving back to Want to play clears the score and Undo restores it; a signed out user is sent to sign in; failed writes never show false success.
- [ ] Design it (spec): `/architect game status and rating`

## Slice G2: The games library

### G5. Games tab and library pages · needs a decision · GA
GAMES joins the navbar tabs, and the three library pages show Want to play, Playing and Finished for games.
**Done when:** `lib/catalog/media-type.ts` accepts `game` and `typedHref` writes it; the GAMES tab shows; `/watchlist`, `/upcoming` and `/watched` with `?type=game` show the right label, count, sort and pages, with empty states; each tab loads up to 500 games through batched IGDB reads and no page writes when it loads; unreleased games on Want to play show their release badge; an invalid `type` still shows the "That page doesn't exist" panel.
- [ ] Design it (spec): `/architect games tab and library pages`

## Slice G3: Discovery

### G6. Games home and list pages · needs a decision
`/games` becomes the games landing, with rows of carousels like `/shows` and `/movies`.
**Done when:** `/games` shows four rows (Popular right now, Recently released in the last 60 days, Coming soon in the next 120 days by hype, Top rated with a minimum vote count), each streaming and failing on its own with Retry; each See all link opens a paged list page; the proxy accepts the known slugs and 404s anything else.
- [ ] Design it (spec): `/architect games home and list pages`

## Slice G4: Search and cards

### G7. Game search and filters · needs a decision
Games in `/search?type=game` with a title query and filters for genre, release year, minimum IGDB rating and platform.
**Done when:** every shown result meets every selected filter; filters live in shareable URL parameters and survive opening a game and coming back; pagination works and counts stay truthful (omitted or marked partial when unknown); loading, empty and failure states have a retry path.
- [ ] Design it (spec): `/architect game search and filters`

### G8. Game cards everywhere · needs a decision
Game cards match the movie card: IGDB rating badge, your score when set, release year, and a status chip with a small control.
**Done when:** home rows, list pages, `/search` and the library pages all use the full game card; each grid reads the signed in user's statuses once, like `getMovieGridStates`; a card's status always matches its library page; the release gate applies on the card too.
- [ ] Design it (spec): `/architect game cards everywhere`

## Slice G5: Richer game page

### G9. Richer game page · needs a decision
The game page grows its sections in this order: hero, summary, developer and publisher, screenshots, trailer, similar games, Facts.
**Done when:** every section renders from cached IGDB data and is omitted when IGDB has nothing, never invented; the trailer uses the existing `youtube-nocookie` dialog that loads only after a click; similar games use the home row card; Facts lists game modes, themes, player perspectives, franchise and the release date for each platform; the shell stays prerendered.
- [ ] Design it (spec): `/architect richer game page`

## Slice G6: Launch

### G10. Games launch · needs a decision · GA
Turn games on for search engines and production, with the credits IGDB asks for.
**Done when:** game pages and list pages are in the sitemap with `VideoGame` JSON-LD and share cards; an `IGDB_ATTRIBUTION` sits next to `TMDB_ATTRIBUTION` in the footer and on `/terms` with `LEGAL_LAST_UPDATED` bumped; IGDB's current terms are checked again and the result recorded; the `IGDB_*` variables are set in Vercel and the change is deployed through [docs/deploy.md](../deploy.md).
- [ ] Design it (spec): `/architect games launch`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Platform you play on, hours played, 100% completion** (from the 2026-10-17 grilling): skipped for the first pass
- **Dropped or Paused status**: left out, matching the removal of TV holds on 2026-10-10
- **Where to buy a game**: no store links in this pass

## Legend

The lifecycle, status words, tags and pointer line work exactly as in the [scope.md legend](scope.md#legend). Every feature here starts `planned` with one box, its `/architect` entry; `· GA` adds a fresh model `/check review` and `/document` after `/test`.
