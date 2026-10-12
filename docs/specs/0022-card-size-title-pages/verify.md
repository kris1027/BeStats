# Verify: Consistent card size and richer title pages · spec 0022 · updated 2026-10-12
_Steps derived from spec 0022 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

### Card strand
- [ ] Open `/movies/popular` at 1280px → 6 columns, a card 180 to 190px wide, image `sizes` starts `(min-width: 1280px) 187px`, the first 6 posters eager → AC-1, AC-2, AC-4, AC-5
- [ ] Same page at 375, 640, 768 and 1024px → 2, 3, 4 and 5 columns, the grid never wider than the page → AC-1, AC-7
- [ ] Repeat at 1280px on `/shows/top-rated`, `/search?type=movie&q=star`, `/watchlist`, `/upcoming` and `/watched` (both `?type=`) → 6 columns everywhere, card controls keep their tap targets → AC-2, AC-7
- [ ] Slow the network and load `/watchlist?type=tv` → the skeleton is one row (2, 3, 4, 5 or 6 cards for the width) and a one row library does not shift on arrival → AC-6
- [ ] Open `/shows/1396` → the season grid is still 2 columns below 768px and 4 from it, cards 288px wide at 1280px → AC-3
- [ ] Open `/showcase` → the poster grid section shows 6 cards, including the missing poster tile at a real poster's footprint → AC-7
- [ ] Known, not caused by this feature: signed in at 768px and 1024px the navbar is wider than the page (scrollWidth 1173 and 1239). Confirm on `main` and track it separately.

### Title pages
- [ ] Open `/movies/550` → hero shows an `R` chip and a Trailer button; sections read Overview (with "Directed by", "Written by"), Where to watch in United States, Cast, More like this, Facts → AC-13, AC-15, AC-17
- [ ] Open `/shows/1396` → hero shows `TV-MA` and Trailer; sections read Overview (with "Created by"), Seasons, Where to watch, Cast, More like this, Facts → AC-15, AC-17
- [ ] On `/movies/550` press Tab to Trailer and Enter → dialog opens with focus on Close, iframe from `youtube-nocookie.com/embed/...?autoplay=1&rel=0&playsinline=1`; Escape closes it, the iframe is gone and focus is back on Trailer → AC-11, AC-20
- [ ] Before pressing Trailer, check the network panel → no request to any YouTube host → AC-11, AC-19
- [ ] Where to watch on `/movies/550` → groups in the order Stream, Free, Rent or buy, each only when it has providers; one "All options on TMDB" link (new tab) and "Availability data from JustWatch" → AC-12
- [ ] Open `/movies/1000010` → no Trailer, no chip, "Not streaming in United States right now." with the JustWatch line → AC-12, AC-13, AC-16
- [ ] More like this on `/movies/550` → up to 12 cards at the home row width with badges and your status, arrow scroller, no See all → AC-14
- [ ] Facts on `/movies/550` → Status, Original language, Budget `$63M`, Revenue `$100.9M`, Production companies; no Unknown or $0 anywhere → AC-16
- [ ] Facts on `/shows/1396` → Status, Type, Original language, Networks (AMC), Production companies, First aired, Last aired → AC-16
- [ ] Throttle the network on a title page → Where to watch and More like this show skeletons; the hero has no placeholder for Trailer or the chip → AC-18
- [ ] Force the extras read to fail (block `api.themoviedb.org` for the extras request, or a title whose extras 404) → no Trailer or chip, Where to watch and More like this each show one line with Try again to the page; tracking and the rest still work → AC-18
- [ ] At 375px on both title pages → no sideways page scroll, More like this scrolls inside itself, the trailer dialog fills the screen with square corners, Close is 44px → AC-20
- [ ] Open `/privacy` → YouTube under processors, the country sentence under What we collect, the trailer sentence under Cookies, Last updated 2026-10-12 → AC-19

## Value sourcing (one step per row)
- [ ] Grid columns, sizes and eager count come from the preset: change nothing, read `POSTER_GRID_SIZES` in the page HTML at 1280px and 1024px → `187px` and `20vw` entries → AC-4
- [ ] Trailer key: on `/movies/550` the trailer is `dfeUzm6KF4g` (official, newer than the other official trailer), not the unofficial `6JnN1DmbqoU` → AC-11
- [ ] Region from the header: `curl -s -H "x-vercel-ip-country: PL" <url>/movies/550` → "Where to watch in Poland" with Netflix and HBO Max, chip "Age rating in Poland" (18) → AC-9
- [ ] Region fallback: repeat with `XX`, `T1`, `pl` and no header → "United States" every time → AC-9
- [ ] Age chip certification: with `PL` the movie shows `18` (Polish theatrical), with `US` it shows `R` (theatrical, not the festival release) → AC-13
- [ ] Recommendations: More like this titles match TMDB's `/movie/550/recommendations` page 1 with adult titles removed → AC-14
- [ ] Your status per card: plan one recommended movie, reload → its More like this card shows Planned, as on the catalog grids → AC-14
- [ ] Crew names: "Directed by David Fincher", "Written by Jim Uhls" come from `getMovie`'s credits; no extra TMDB request is made for them → AC-15
- [ ] Facts: every value matches `getMovie` / `getTvShow` (budget and revenue in compact US dollars, languages via `languageName`) → AC-16
- [ ] Provider and network logos load from `image.tmdb.org` through `next/image` → AC-12, AC-16

## Commands
- [ ] `pnpm typecheck` → no errors → all
- [ ] `pnpm lint` → no errors → all
- [ ] `pnpm test` → all pass, including `poster-grid.test.tsx`, `lib/tmdb/extras.test.ts`, `lib/catalog/region.test.ts`, `components/catalog/title-extras.test.tsx`, `trailer-button.test.tsx`, `title-details.test.tsx`, `lib/legal/boundary.test.ts` → AC-1 to AC-19
- [ ] `pnpm build` → `/movies/[id]` and `/shows/[id]` still listed as ◐ (Partial Prerender) → AC-10
- [ ] `grep -rn "getVisitorRegion\|extras" lib/seo app/**/opengraph-image* proxy.ts app/sitemap.ts` → nothing; `generateMetadata` unchanged → AC-10

## Acceptance-criteria coverage
- AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7: card strand steps and the value sourcing grid step
- AC-8: value sourcing crew step, `extras.test.ts`, the request scope test in `region.test.ts`
- AC-9: both region value sourcing steps, `region.test.ts`
- AC-10: build and grep commands
- AC-11: trailer steps; AC-12: Where to watch steps; AC-13: chip steps; AC-14: More like this steps
- AC-15, AC-16: crew and Facts steps; AC-17: page order steps; AC-18: loading and failure steps
- AC-19: privacy step and the no YouTube request step; AC-20: 375px and keyboard steps
