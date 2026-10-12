# Verify: Home carousels · spec 0021 · updated 2026-10-12
_Steps derived from spec 0021 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open `/shows` at 1280px. You should see the h1 `Shows`, then rows in this order: Trending this week, Popular, Airing today, On the air, Top rated. Each has See all and two arrow buttons → AC-1
- [ ] Open `/movies` at 1280px. You should see the rows Trending this week, Popular, Now playing, Upcoming, Top rated → AC-1
- [ ] Count the cards in any row. There should be at most 12, in the same order as the first 12 on that row's See all page → AC-3
- [ ] Watch the network panel while you open See all on a row you just loaded. No new TMDB request should be made for page 1 → AC-3
- [ ] On a row, check that back starts disabled. Press forward: the row scrolls about 90% of its width, back turns on, and at the end forward turns off → AC-6
- [ ] Turn on reduced motion in the OS or DevTools and press an arrow. The row should jump with no smooth scroll → AC-6
- [ ] At 375px, check that no arrow buttons show and the page has no sideways scroll. The rows still swipe → AC-5, AC-6
- [ ] Tab to a row's card area. A focus ring should show, and the arrow keys should scroll it → AC-5
- [ ] Throttle the network and reload `/shows`. The h1 and every row header should show at once, with 12 skeleton cards per row and no shift when cards arrive → AC-7
- [ ] Check that the first 6 posters of the first row have no `loading="lazy"`, and every other row poster does → AC-7
- [ ] Block one list request, for example `api.themoviedb.org/3/tv/top_rated`, and reload. Only that row should show `Couldn't load Top rated` with Try again to `/shows`. The other rows are normal and nothing shifts → AC-11
- [ ] Use a fixture or a blocked response with empty results for one row. It should show `Nothing here right now.` and keep See all → AC-12
- [ ] Open every See all page (`/shows/trending`, `/shows/popular`, `/shows/airing-today`, `/shows/on-the-air`, `/shows/top-rated`, `/movies/trending`, `/movies/popular`, `/movies/now-playing`, `/movies/upcoming`, `/movies/top-rated`). Each shows `← Shows` or `← Movies`, its h1 and note from AC-9, 20 cards, and `Page 1 of N` → AC-9
- [ ] Open `/shows/top-rated?page=abc` and `/shows/top-rated?page=600`. Both should show `That page doesn't exist` with `Back to page 1` linking `/shows/top-rated` → AC-10
- [ ] Sign in (run `pnpm dev:docker`, seed user `user-a@example.test`). Track a show from the Popular row, then check its badge and controls match its library page → AC-4
- [ ] Signed in, plan an unreleased movie from the Upcoming row. It should follow the release gate (plan only, no watched mark) → AC-4
- [ ] Find a movie with no poster in any row. It should show the fallback tile at the same size → AC-4

## Commands
- [ ] `curl -sI localhost:3000/shows?page=3` → `308`, `location: /shows/popular?page=3` → AC-14
- [ ] `curl -sI "localhost:3000/movies?page=abc"` → `308` to `/movies/popular?page=abc`, which then shows `That page doesn't exist` → AC-14, AC-10
- [ ] `curl -s -o /dev/null -w "%{http_code}" localhost:3000/shows/upcoming` → `404`; the same for `/shows/now-playing`, `/movies/airing-today`, `/movies/on-the-air`, `/shows/Popular`, `/shows/popular.jpg`, `/shows/popular/season/1` → AC-13
- [ ] `curl -s localhost:3000/shows/top-rated?page=2 | grep canonical` → canonical `/shows/top-rated?page=2`; `?page=999` → `noindex` → AC-15
- [ ] `curl -s localhost:3000/shows | grep -o '<title>[^<]*\|canonical[^>]*'` → title `Shows`, canonical `/shows` → AC-15
- [ ] With `VERCEL_ENV=production` and `NEXT_PUBLIC_SITE_URL` set, read `/sitemap.xml`. After `/movies` and `/shows` come the five movie list paths, then the five TV list paths, with no `?page=` → AC-16
- [ ] `TMDB_READ_ACCESS_TOKEN= pnpm build` → passes, every list route shows as Partial Prerender → AC-7
- [ ] `pnpm test` → `lib/tmdb/lists.test.ts` (endpoints, region, timezone, adult drop), `lib/catalog/lists.test.ts`, `lib/catalog-list-read.test.ts`, `app/catalog-lists.test.ts` and `app/movies/request-scope.test.ts` pass → AC-2, AC-8, AC-17

## Value sourcing
- [ ] `region=PL`: in the network log, `/movie/now_playing` and `/movie/upcoming` carry `region=PL`; `/movie/top_rated` and `/trending/movie/week` carry none → AC-2
- [ ] `timezone=Europe/Warsaw`: `/tv/airing_today` and `/tv/on_the_air` carry it; no other TV list does. Near midnight UTC the Airing today row should follow Warsaw's date, not UTC's → AC-2
- [ ] `returnPath`: signed out, press a row card's bookmark. Sign in should send you back to `/shows` (a landing) or to the exact list page URL with its `?page=N` → AC-4
- [ ] Popular shares the sitemap's cache: `/shows/popular` page 1 and the sitemap's discover page 1 make one TMDB request between them while fresh → AC-3

## Acceptance-criteria coverage
- AC-1 … landing steps · AC-2 … `lists.test.ts`, value sourcing · AC-3 … row count and network · AC-4 … signed in steps · AC-5 … 375px, focus · AC-6 … arrows, reduced motion · AC-7 … skeletons, eager posters, tokenless build · AC-8 … `lists.test.ts` · AC-9 … list pages · AC-10 … bad page · AC-11 … blocked row · AC-12 … empty row · AC-13 … curl 404s · AC-14 … curl 308s · AC-15 … metadata curls · AC-16 … sitemap · AC-17 … request scope test
