# 0028. Games home and list pages: rationale

## Context

Games have a page (spec 0025), a status and rating (spec 0026) and three library tabs (spec 0027), but nothing to browse. A visitor can reach a game only by its URL, and the games library tabs say "Games you mark Want to play show up here" with no way to find one. `/games` itself 404s.

The scope row for G6 was written on 2026-10-17 and asks for carousel rows "like `/shows` and `/movies`". On 2026-10-18 those two pages stopped being rows: they became the parallax landing (prompts/home-parallax-landing.md), a full bleed hero and five sections that each have their own layout and motion. The rows survive only on the title pages. So "like the siblings" and "carousel rows" now point at different things.

IGDB is not TMDB. It has no ready made trending, now playing or upcoming lists; it has a query language over its `games` endpoint and a separate `popularity_primitives` endpoint that ranks game ids by signals such as visits and players. The module from spec 0023 already offers `discoverGames` with date windows, hype and rating sorts, but returns 20 per page while every list page in the app shows 24, and a game summary carries only a portrait cover, while the landing's hero and wide cards need landscape art. Popularity primitives return ids only, and some of those ids are DLC or editions the catalog filter hides.

The navigation was left half open on purpose. Spec 0027 kept `MediaType` two valued and the GAMES tab on the library pages only, and listed what G6 owes: `/games` in `CATALOG_PATHS`, GAMES on every page, a Browse games button on the empty tabs, and a logo that remembers `game`. Game search is G7, so a games page must not offer a search that returns shows. Production still has the games flag off, and spec 0025 keeps every game page `noindex` until G10.

## Options considered

### Option 1: One landing over a widened list registry

Widen the list registry, the read seam (`readLandingList`, `TaggedCatalogPage`) and `LandingItem` to a third media type. `/games` renders the same `CatalogLanding` with game slots, and the list pages reuse `CatalogListPage` with a game card. IGDB gains a popularity read, an art field and a page size.

**Pros**:
- One landing for three catalogs; a fix or a design change lands once.
- `/games` matches its siblings exactly, which is what AGENTS.md section 3 asks of new screens.
- The registry keeps every slug in one place for the routes, the proxy and the sitemap guard.

**Cons**:
- The landing code, typed for TMDB today, must branch on a third type, and each branch is a place a TMDB assumption can leak (the rating badge, the status slots).
- The registry now holds entries the sitemap must skip until G10.

### Option 2: A separate games landing

Copy the six landing parts into `components/game/landing/` and read IGDB directly, leaving the TMDB landing untouched.

**Pros**:
- Zero risk to `/shows` and `/movies`.
- Game specific choices (no status, different badge) need no branching.

**Cons**:
- Two copies of the parallax engine and its six layouts drift; the next landing change has to be made twice.
- The registry, proxy and sitemap still need games, so the saving is smaller than it looks.

### Option 3: Plain carousel rows, as the scope text says

Four `CarouselScroller` rows (Popular right now, Recently released, Coming soon, Top rated) and four list pages.

**Pros**:
- Smallest build; the row component already exists.
- No hero, so no landscape art is needed.

**Cons**:
- `/games` would look like the old landing the other two retired, an inconsistency every visitor sees when switching tabs.
- The engineer chose the parallax landing in the design conversation.

## Rationale

Option 1 follows from two forces in the Context: the siblings changed shape after the scope was written, and the UI rule says new screens follow the shipped UI. Copying the landing (Option 2) would honour the look but double the most motion heavy code in the app; widening it costs a few typed branches that the compiler lists for us, the same way spec 0027 widened the library types.

Filling five sections from four scope lists was settled by adding a second popularity list rather than dropping a section: IGDB's `Visits` reads as "trending" (what people look at now) and `Playing` as "popular" (what people play now), which mirrors the trending and popular pair on the TMDB landings. Recently released and Coming soon both order by hype, the engineer's pick: newest first surfaces obscure releases, and hype keeps the known games on top. Top rated needs a floor of 100 ratings so a handful of perfect scores cannot lead.

The popularity read takes the top 500 primitives and the whole visible list in one cached batch, so a list page can slice it and give an exact count with every page full, the engineer's "overfetch to fill". Reading primitive pages one at a time would leave short or overlapping pages once hidden games drop out. The cost is one heavy batch per list, cached for hours, which matches how often IGDB recalculates popularity.

Art comes from expanding `artworks` and `screenshots` in the summary fields, not a separate read: it gives every card and the hero landscape art with no extra request. The page size becomes an option so the grid fills its 2, 3, 4 and 6 columns as every other list page does, while spec 0023's callers keep 20.

The release posture (live but `noindex`, unlinked in production) repeats spec 0025's, so G10 stays the one switch for search engines and production. The flag stays until then and G10 removes it, closing spec 0027's open question. The GAMES tab on `/search` links to `/games` because a tab that switched `/search` to games would land on a search that does not exist until G7, and the navbar search hides on games pages for the same reason.

Runner ups for the calls made in writing: `getPopularGames` as a list returning summaries (over returning ids and batching in the page, which would put a second cache boundary in the page); `pageSize` limited to 20 or 24 (over any value, which would grow the validation surface for no caller); `CATALOG_PATHS` keyed by `LibraryType` (over widening `MediaType`, which would reach `/search` and the TMDB reads before G7).
