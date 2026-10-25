# Verify: Games home and list pages · spec 0028 · updated 2026-10-25
_These steps come from the acceptance criteria in spec 0028. `/check verify` runs them, and `/test` locks in the ones that should last. Run them with `NEXT_PUBLIC_GAMES_LIBRARY=on` unless a step says otherwise._

## UI / manual
- [x] Open `/games` at 1280px. You should see, in order: the hero, Trending now, Popular, Recently released (sidebar label `New releases`), Coming soon and Top rated. Each section has a See all link to `/games/{slug}`. → AC-1, AC-9
- [x] Count the cards on `/games`: Trending 9, Popular 14, Recently released 12, Coming soon up to 40 across 4 rows, Top rated 8. A short list shows fewer cards, never padding. → AC-3
- [x] The hero shows Trending's first game over its art (or its cover when there's no art), the `#1 Trending` chip, the IGDB community rating when the game has one, up to 3 genres, the name linked to `/games/{id}`, and no Trailer button. → AC-7
- [x] Signed out: the hero shows no status control. Signed in (`pnpm dev:docker`): the hero shows Want to play / Playing / Finished. On an unreleased game only Want to play is allowed. → AC-7, AC-19
- [x] Coming soon cards show the UTC release day (`Nov 19`, or `Feb 12, 2027` for another year) over the game's art. A game with no art shows its cover cropped to fill. → AC-8
- [x] Every game card links to `/games/{id}` and has no personal badge and no controls. → AC-8
- [x] The sidebar line reads `The 12 most anticipated games of the last 60 days.` → AC-9
- [x] Open each See all page. You should see `← Games`, the h1, the note, 24 cards and `Page 1 of M`. Next goes to `?page=2`. → AC-9, AC-10
- [x] Open `/games/trending?page=99` and `/games/top-rated?page=60`. Each shows "There are no … at this page number." → AC-10
- [x] Block IGDB (for example, set a bad `IGDB_CLIENT_SECRET` and restart). Each landing section shows `Couldn't load …` / `IGDB didn't respond.` with Try again, and a list page shows `Couldn't reach IGDB` with a retry to the same URL. → AC-11
- [x] GAMES is lit on `/games`, `/games/top-rated` and `/games/1942`. On `/shows`, `/movies/550` and `/search` it links to `/games`. On `/watched` it switches `?type=game`. → AC-14
- [x] Set `NEXT_PUBLIC_GAMES_LIBRARY=off` and restart. No GAMES tab shows anywhere, and `/games` and `/games/top-rated` still load by URL. → AC-14
- [x] There's no navbar search on `/games` or `/games/*`. Every other typed page keeps it. → AC-15
- [x] The logo links to `/games` on `/games*` and on `/watched?type=game`. Then on `/account` it still links to `/games`. With the flag off, the same remembered value sends it to `/shows`. → AC-16
- [x] An empty games library tab shows a `Browse games` button to `/games`. `/games/999999999` (an unknown game) shows `Browse games` too. → AC-17
- [x] At 375px there's no horizontal scroll on `/games` or a list page. Tab moves through the cards in order. With reduced motion turned on, nothing moves. → AC-20
- [x] `/showcase` (in dev) has the "Games landing and lists" section: a game card, wide cards with and without art, a failed section, and the list page error and empty panels. → AC-21

## Commands
- [x] `curl -s -o /dev/null -w '%{http_code}' localhost:3000/games/Trending` → 404, and the same for `/games/coming_soon` and `/games/trending.jpg`. `/games/coming-soon` and `/games/1942` → 200. → AC-12
- [x] `curl -s localhost:3000/games | grep -c noindex` → at least 1, and there's no `rel="canonical"` on `/games` or any list page. → AC-13
- [x] `curl -s localhost:3000/sitemap.xml | grep -c /games` → 0 (on an indexable deployment). → AC-13
- [x] `IGDB_CLIENT_ID= IGDB_CLIENT_SECRET= pnpm build` passes and lists `/games` and the five list pages as ◐. → AC-18
- [x] `pnpm igdb:live` passes: the art rungs, Visits = 1 and Playing = 3 from IGDB, both popularity lists, and at least 12 hyped recent releases. → AC-2, AC-4, AC-6
- [x] `pnpm typecheck && pnpm lint:ci && pnpm test` all pass. → AC-5, AC-20

## Value sourcing
- [x] The windows follow the UTC day. Near midnight UTC, Recently released ends on the UTC date, not the local one (see the test in `lib/catalog-list-read.test.ts`). → AC-2
- [x] Top rated asks for `rating_count >= 100` (check the IGDB body in `lib/catalog-list-read.test.ts` or the logs). → AC-2
- [x] A hidden edition among the top popularity primitives never shows on Trending or Popular, and the page count is exact (`Page 1 of M` with `M = ceil(kept / 24)`). → AC-4, AC-10
- [x] The hero genres come from IGDB's genre list. When that read fails, the genres are left out. → AC-7

## Acceptance criteria coverage
- AC-1 landing order · AC-2 sources and windows · AC-3 counts and shared cache · AC-4 popularity filter · AC-5 page size (unit tests) · AC-6 art and ladder (unit and live) · AC-7 hero · AC-8 cards · AC-9 list pages and copy · AC-10 pagination · AC-11 failures · AC-12 proxy · AC-13 SEO · AC-14 GAMES tab · AC-15 search hidden · AC-16 logo · AC-17 Browse games · AC-18 build · AC-19 session reads (request scope test, signed in hero) · AC-20 mobile, keyboard, reduced motion · AC-21 showcase
