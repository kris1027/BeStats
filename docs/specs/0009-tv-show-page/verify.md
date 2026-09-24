# Verify: TV show page · spec 0009 · updated 2026-09-24
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Open `/shows` signed out → heading "Popular shows", the popularity note, 20 cards with TMDB badges, no bookmark on any card; tab title "Shows" → AC-1, AC-18
- [x] Open `/shows?page=2` → "Page 2 of 500"; `/shows?page=abc` and `/shows?page=501` → "That page doesn't exist" with a link to `/shows` → AC-2
- [x] Click Breaking Bad (1396) → hero with one `h1`, tagline "Change the equation.", `2008–2013`, an `Ended` pill, genre chips on their own row, amber rating with "TMDB" and vote count; then Overview, Seasons, Cast → AC-3, AC-4
- [x] On 1396 → Seasons 1 to 5 then Specials last, each card reading `{year} · {n} episodes` and linking to `/shows/1396/season/{n}` → AC-7
- [x] On 1396 → Cast starts with Bryan Cranston as Walter White, at most 12 people, sorted by episode count → AC-8
- [x] Open a returning show (for example 1416) → air span reads `{first}–present` with a `Returning Series` pill → AC-4
- [x] Open a show TMDB has no English overview for → the original language overview with the `lang` attribute and "Shown in the original language (…)" → AC-6
- [x] Open `/shows/1396/season/2` → back link "Breaking Bad" to `/shows/1396`, poster, muted show name, `h1` "Season 2", `2009 · 13 episodes`, overview → AC-9
- [x] On season 2 → 13 rows in episode order, each with a still, "Episode N", the name as `h2`, `Mar 8, 2009 · 48m` style line, TMDB rating with label, 3 line overview; the first 2 stills load eagerly, the rest lazily; no "upcoming" label → AC-10
- [x] On season 2 → Previous "Season 1" and Next "Season 3"; on season 5 Next is "Specials"; on season 0 there is no Next; on season 1 there is no Previous → AC-12
- [x] Open `/shows/1396/season/0` → Specials rows with no date read "Air date not announced", and nothing is zeroed → AC-10, AC-5
- [x] Find a season TMDB lists with zero episodes (an announced future season) → card reads "No episodes listed yet"; the season page shows "No episodes yet" with a link back → AC-7, AC-11
- [x] Open `/shows/999999999` → "We couldn't find that show", title "Show not found", `noindex`; `/shows/999999999/season/1` → the same → AC-14, AC-16
- [x] Open `/shows/1396/season/42` → "We couldn't find that season" linking to `/shows/1396`, `noindex`, and no season request in the server log → AC-14
- [x] Block TMDB (for example a wrong token, then restart) → each of the three routes shows "Couldn't reach TMDB" with a working "Try again"; the navbar still works → AC-15
- [x] Make only the aggregate credits request fail → only the Cast section shows the error panel; hero, overview and seasons stay → AC-8
- [x] At 375px on all three pages → no horizontal scroll, stacked hero, stacked episode rows, focus ring visible on the back link, season cards and season links, season links 44px high → AC-19
- [x] Open a movie page (for example `/movies/550`) → it looks exactly as before → AC-20

## Commands
- [x] `curl -I /shows/abc`, `/shows/01396`, `/shows/1396.jpg`, `/shows/1396/season/01`, `/shows/1396/season/10000` → 404 → AC-13
- [x] `curl -I /shows/1396/season/0` and `/shows/1396/season/9999` → not 404 from the proxy → AC-13
- [x] `pnpm build` → `/shows`, `/shows/[id]`, `/shows/[id]/season/[number]` all marked ◐ → AC-17
- [x] `pnpm test` → request scope test covers `app/shows/`, `components/show/`, `components/catalog/`; layout purity passes → AC-18
- [x] `pnpm tmdb:live` → the show read and the aggregate cast read still parse → AC-6, AC-8, AC-20
- [x] `pnpm typecheck`, `pnpm lint:ci` → clean

## Value sourcing
- [x] Air span: compare 1396 (Ended, 2008–2013), a show that ended the year it began (one year), a canceled show, and a planned show with nothing aired (first year only) → `formatAirSpan`
- [x] Air date: run the dev server with `TZ=America/Los_Angeles` and check `/shows/1396/season/1` episode 1 still reads `Jan 20, 2008` → `formatAirDate` in UTC
- [x] Season card poster: a season with no poster shows the show poster, and a show with neither shows the tile → `season.posterUrl ?? show.posterUrl`
- [x] Season existence: the season page for a number not in `show.seasons` makes no `/season/` request → `loadSeason`
- [x] Adult check: an adult flagged show id renders not found on the show and season pages → `loadShow`
- [x] Cache lifetimes: `getTvShow` is `hours`, `getShowCast` `days`, `getSeason` `hours` in `lib/tmdb/reads.ts` → AC-20

## Acceptance-criteria coverage
- AC-1, AC-2: landing steps · AC-3 to AC-8: show page steps · AC-9 to AC-12: season page steps · AC-13: curl steps · AC-14 to AC-16: not found, failure and title steps · AC-17: build · AC-18: request scope test and landing step · AC-19: 375px step · AC-20: movie regression, live check, lifetimes
