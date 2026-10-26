# 0029. Game search and filters: rationale

## Context

Games have a landing, five list pages, a game page and three library tabs, but no way to find one game by name. Spec 0027 hid the navbar search on the games tabs and spec 0028 hid it on `/games*`, both "until G7", so today a person who wants a particular game has to scroll lists. Games scope feature G7 asks for `/search?type=game` with a title query and filters for genre, release year, minimum IGDB rating and platform, with every result meeting every filter, shareable URLs, truthful counts and recoverable failures.

The forces are mostly set by the two catalogs. `/search` (spec 0010) was built around a TMDB limit: TMDB's search endpoint ignores genre and rating, so a query with those filters is scanned and filtered on the server over whole pages, with a partial count and a cursor instead of page numbers. IGDB is different. Its `search` clause takes a `where` beside it (confirmed live on 2026-10-17 and again today), and it returns an exact `X-Count` for both search and plain filtered reads. The IGDB module (spec 0023) already exposes `searchGames` and `discoverGames` with genre, platform, year and rating filters, but it fixed three details that do not fit a search page: genres match any of the ids, search has no rating count floor and a fixed page size of 20, and a discover sort silently drops every game without the sort field.

AGENTS.md section 10 governs the result: every displayed result meets the filters, counts are never an unfiltered total, upstream relevance order is kept, filters survive opening a title and coming back, and there is a retry path. The games rules add that IGDB's community rating is always labelled as such, hidden games never show in search, and `game` widens `/search` only on purpose (spec 0027, AC-2). The games library flag `NEXT_PUBLIC_GAMES_LIBRARY` keeps every games surface off in production until launch.

Not deciding leaves the games tabs with a missing search, which spec 0027 accepted only as temporary, and leaves G8's "cards everywhere" without a search grid to cover.

## Options considered

### Option 1: A games branch inside `/search`, every filter sent to IGDB

`/search?type=game` keeps the page, the filter bar, the state panels and the quick search of spec 0010. The URL parser, the mode function and the result reader gain a games branch with three modes (browse, discover, search), each a single IGDB read with every filter in the query. The IGDB module gains four small options so the reads match the page: genres as all of, a rating count floor on search, a page size of 24 on search, and a discover sort that keeps unrated games.

**Pros**:
- One URL grammar, one filter bar and one quick search for all three catalogs; the navbar tabs switch `type` in place exactly as they do between shows and movies.
- No scan, no cursor and no partial count for games: IGDB's own filtering and count make every result and number true.
- Reuses every tested state, the keyed Suspense skeleton, the GET form and the CDN cached Route Handler.

**Cons**:
- `SearchType` widening touches many files, and the parser must refuse a `platform` on a TMDB type.
- The filter bar grows type specific controls (platforms only for games, different labels and floors).

### Option 2: A separate `/games/search` page

A games only search page under `/games`, with its own parser, filter bar and quick search endpoint, leaving `/search` as the TMDB page.

**Pros**:
- No change to the TMDB search code or its types.
- The games page can diverge freely (different controls, layout).

**Cons**:
- Two search pages, two filter bars and two quick search endpoints to keep consistent, which AGENTS.md's "reuse existing components and patterns first" argues against.
- The navbar tabs could no longer switch the search catalog in place; a tab switch would jump between routes and lose the query.
- A second public endpoint spending an API credential needs its own firewall rule.

### Option 3: Reuse spec 0010's filtered search scan for games

Treat IGDB like TMDB: send the title upstream, filter genre, platform and rating locally over whole pages, with a partial count.

**Pros**:
- One code path for every catalog's filtered search.

**Cons**:
- Throws away IGDB's ability to filter inside the search, trading exact counts and page numbers for partial counts and a cursor.
- Up to five IGDB requests per page under a limiter of four requests a second, where one is enough.

## Rationale

Option 1 wins because IGDB removes the very problem spec 0010's complexity exists for. With every filter in one query and an exact count, the games branch is the simplest of the three: one read per page, numbered pages, a real total. Keeping it inside `/search` holds the pattern people already use for shows and movies, keeps the tab switch in place (the engineer chose to keep `q`, `year` and `rating` across it), and lets the existing firewall rule and CDN cache cover games quick search with no new surface. Option 2 duplicates a large, carefully tested page for no capability gain, and Option 3 would make game search worse than IGDB allows.

The engineer settled the behaviour in the design conversation. Quick search ships with the page, so the games tabs and `/games*` get the navbar search back. Several genres mean all of them, matching shows and movies (spec 0010, AC-10); several platforms mean any of them, because the question a person asks is "can I play this on something I own". The platform picker lists all of IGDB's platforms with a filter box rather than a hand picked short list, so no platform is unreachable and the list never needs upkeep. Browse shows the Popular list `/games` already uses, so a bare `/search?type=game` matches what the games landing calls popular and costs no extra request. Filters without a title sort by rating count, the closest stand in for popularity a filtered IGDB query can sort by, and keep unrated games after rated ones (the live check below showed a strict sort would hide 481 of Nintendo Switch 2's 770 games and make the count untrue). A minimum rating brings a floor of 10 IGDB ratings, because IGDB's counts are far smaller than TMDB's: at 8 and above, a 100 floor keeps 816 games and a 10 floor keeps 2,274, while no floor lets games rated by two people top a `9+` filter. The year select runs from 1950 (the module's floor) to next year, matching shows and movies. Result cards stay plain until G8 gives every grid its status chip at once.

The small calls made while writing: the server reads the flag through `getGamesLibrary()`, the same reader `LibrarySection` uses, so an invalid value fails loudly rather than quietly hiding games (the runner up, `gamesLibraryEnabled()`, reads an invalid value as off, which suits only the navbar). The quick search response renames `tmdbRating` to `rating` for every type instead of adding a parallel games field, because the row already knows its type and therefore its label. A tab switch drops a kept year the new type cannot take, so switching never lands on an invalid panel; the runner up, keeping it and showing the panel, punishes a click on a tab. Counts get an `igdb` endpoint with no cap wording, because no IGDB cap has been observed; a null count simply hides the line, as the games list pages already do.

## Evidence: live IGDB checks on 2026-10-25

Run against real IGDB with the project's Twitch credentials, through `pnpm igdb:live` (17 passed, 1 skipped) and direct read only count queries with the catalog rule applied.

- `X-Count` is present on search (`zelda` on Switch: 8) and on a plain `where` (30,883 rated visible games).
- 23 genres and 220 platforms.
- Genres: `genres = [5,12]` (all of) counts 2,229 games; `genres = (5,12)` (any of) counts 77,969.
- Rating floors: rating at least 7 counts 16,364 games with no floor, 6,507 with at least 10 ratings, 1,615 with at least 100; at least 8 counts 5,397, 2,274 and 816.
- Nintendo Switch 2 (platform 508) has 770 visible games, 289 with any rating. Sorting by `rating_count desc` without requiring the field returns the rated games first and the unrated ones after them (offsets 289 to 769 are all unrated). Reading offsets 289 to 769 as one request and as two requests returned the same ids in the same order, each once.
