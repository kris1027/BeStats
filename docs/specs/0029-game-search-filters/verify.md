# Verify: Game search and filters · spec 0029 · updated 2026-10-25
_Steps derived from spec 0029 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run against `pnpm dev:docker` with `NEXT_PUBLIC_GAMES_LIBRARY=on` and the IGDB credentials in `.env.local`, unless a step says the flag is off.

## UI / manual
- [x] Open `/search?type=game&q=zelda` → 24 game cards (cover, name, year, IGDB star), the line `{n} games` with separators, numbered pages; page 2 shares no game with page 1 → AC-1, AC-3, AC-6, AC-8, AC-12
- [x] Open `/search?type=game` → `Popular games on IGDB`, the same first 24 games as `/games/popular`, numbered pages over the list's length → AC-4
- [x] Open `/search?type=game&platform=508` → most rated first, unrated games after them, a count that includes them → AC-5
- [x] Open `/search?type=game&q=mario&genre=8&platform=130&platform=508&rating=7` → every card is a Platform game on Switch or Switch 2 rated 7 or more; the note `Only games with at least 10 IGDB ratings` shows → AC-6, AC-7, AC-9
- [x] Select two genres → every game has both (all of); select two platforms → games on either (any of) → AC-7
- [x] Each of `?type=game&platform=0`, `?type=game&year=1949`, `?type=movie&platform=6`, 21 `genre` ids, `?type=game&q=%01` → `That filter isn't valid` naming the parameter, no results request in the server log → AC-2
- [x] `?type=game&page=51` → `That page doesn't exist` with `Back to page 1`, before any IGDB request; `?type=game&q=zelda&page=7` (past the last page) → the same panel → AC-8
- [x] Open a game from results, press Back → the same URL and the same results → AC-2
- [x] Filter bar on `type=game`: Genres (`MUST HAVE ALL OF`), Platforms, years from next year down to 1950, `Any IGDB rating` and `5+` to `9+`, `Clear filters` when anything (a platform too) is set → AC-9
- [x] Toggle three platforms quickly → the boxes tick at once and the URL changes once, about 400 ms after the last click → AC-9
- [x] Open Platforms → the filter box has focus; type `switch` → only Switch platforms; a ticked platform hidden by the filter stays in the URL; `zzz` → `No platforms match`; clearing shows the full list → AC-10
- [x] Tick 20 platforms → every other box is disabled with `Up to 20` → AC-10
- [x] Submit the form before hydration (JavaScript off) → `Apply` keeps genres and platforms through hidden inputs → AC-9, AC-10
- [x] Make the platform list read fail (IGDB credentials wrong, cache cold) → `Platforms` disabled with `Platforms unavailable`, the rest of the bar works; with `platform=` in the URL the results show `Couldn't reach IGDB` → AC-11
- [x] With IGDB unreachable, `/search?type=game&q=zelda` → `Couldn't reach IGDB`, `IGDB didn't respond. Try again in a moment.`, `Try again` reloads the same URL; the heading and bar stay usable → AC-13
- [x] `/search?type=game&q=zzzqqqxx` → `No games match “zzzqqqxx”`; a filter with no match → `No games match these filters` with the games copy; each offers `Clear filters` to `/search?type=game` → AC-13
- [x] On `/search?type=movie&q=dune&year=1940&genre=878` press GAMES → `/search?type=game&q=dune` (year and genre dropped), GAMES lit; MOVIES from there keeps `q` → AC-14
- [x] On `/games`, `/games/top-rated`, `/games/1942`, `/watchlist?type=game` and `/search?type=game` the navbar search reads `Search games`; type `hollow` → rows with cover, year, amber star (screen reader `IGDB community rating`), the footer `{n} games` and `See all` to `/search?type=game&q=hollow` → AC-15, AC-16
- [x] Quick search with no match → `No games match “…”`; with IGDB failing → `Couldn't reach IGDB` and `Try again` → AC-16
- [x] On `/search?type=game` the logo links to `/games` and the next page with no type remembers games → AC-18
- [x] Set the flag off and restart: `/search?type=game` shows `That filter isn't valid` naming `type`, no GAMES tab, no game search on `/games`, the logo goes to `/shows` → AC-1, AC-15
- [x] Set the flag to `maybe`: `/search?type=movie&q=dune` still works → AC-1
- [x] At 375px, `/search?type=game&q=mario&platform=130&rating=7` has no horizontal scroll and the bar wraps; at 1280px the grid fills rows of six → AC-21
- [x] Keyboard only: Tab from the title field reaches Genres, Platforms (Enter opens it, focus lands in the filter box), Year, Rating, Clear filters, every card and the pager in order → AC-21
- [x] `/showcase` → the Game search section: the platform list with `switch` typed, `No platforms match`, `Platforms unavailable`, and quick search rows with and without a cover → AC-21

## Value sourcing
- [x] Flag: read only for a raw `type=game`; with an invalid flag a movie search works and a game search shows the error → AC-1
- [x] Genre and platform options and valid ids come from IGDB's cached lists: an id IGDB does not list is refused → AC-2
- [x] Year range upper bound moves with the UTC year: next year is offered, the year after is refused → AC-2
- [x] Mode follows the URL alone: no `q` and no filter is browse, any filter discover, any `q` search → AC-3
- [x] Browse reads the same cached Popular list as `/games/popular`: the first 24 match card for card → AC-4
- [x] Discover sends `rating_count_desc` with no `rating_count != null`; search sends no sort → AC-5, AC-6
- [x] `minRatingCount` 10 is sent only with a rating set → AC-5, AC-6
- [x] Count line is IGDB's `X-Count`, left out when IGDB sends none (fixture), and pages stop at 50 → AC-8
- [x] Card name, cover, year, rating and link come from the game summary and `/games/{id}` → AC-12
- [x] Error and empty copy name IGDB and say `games` → AC-13
- [x] Navbar type follows `libraryType`: `game` on `/games*` by pathname and on typed paths by `type` → AC-15
- [x] Tab hrefs on `/search` keep `q`, `year` (when games can take it) and `rating` → AC-14
- [x] Quick search rows come from IGDB search page 1 cut to 5, with `rating` and `/games/{id}` links → AC-16, AC-17

## Commands
- [x] `pnpm typecheck && pnpm lint && pnpm test` → all pass → AC-1 to AC-21
- [x] `pnpm igdb:live` → passes, including `matches every genre of a two genre filter` and `puts unrated games after rated ones and counts them` → AC-19
- [x] `pnpm build` → `/search`, `/games` and the five `/games/*` list pages are `◐` partially prerendered; `.next/server/app/games.html` contains `Search games` → AC-15, AC-20
- [x] `curl -i 'http://localhost:3000/api/search?type=game&q=zelda'` → 200 with `public, s-maxage=300`, five results with `rating`; `q=%01%01` → 400 `{ "error": "invalid" }`; with a session cookie → no `Set-Cookie` and the same body → AC-17, AC-20
- [x] With the flag off, `curl 'http://localhost:3000/api/search?type=game&q=zelda'` → 400 → AC-17

## Acceptance-criteria coverage
- AC-1 flag steps, invalid flag step, typecheck · AC-2 invalid input, Back, value sourcing · AC-3 zelda, modes · AC-4 browse · AC-5 discover · AC-6 combined filters · AC-7 genres all of, platforms any of · AC-8 count and paging, page 51 · AC-9 bar, toggles, Apply · AC-10 picker, cap · AC-11 list failure · AC-12 cards · AC-13 states · AC-14 tab switch · AC-15 navbar search, build · AC-16 quick search · AC-17 Route Handler · AC-18 logo · AC-19 `pnpm igdb:live` · AC-20 build, curl · AC-21 375px, keyboard, showcase
