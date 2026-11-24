# Mobile look, slice 3: title extras

## Goal

Bring the web's title page extras to the app's movie, show and game screens (feature 29, slice 3 in [docs/scope/scope.md](../docs/scope/scope.md)): the Trailer button, the age rating pill, Where to watch and More like this. Movies and shows read them through a new `/api/v1` extras route; games already carry their trailer and similar game ids on the v1 game read, and get one new read that turns those ids into cards.

Governing decisions: [prompts/mobile-web-parity-foundation.md](mobile-web-parity-foundation.md) (Roadmap item 2) and [prompts/mobile-look-title-pages.md](mobile-look-title-pages.md) (decision 1 moved the age pill here). The web is not changed, apart from the new routes and anything they share with the web pages.

## Progress (2026-11-24)

Built on `feat/mobile-look-title-extras`, not committed. Every automated check passes and the three routes answered against live TMDB and IGDB. The simulator pass (Manual test steps) is still to run. Deviations from Expected files: the app's fetchers and keys live in `src/lib/catalog.ts` (no `src/lib/extras.ts`), the region helper is `regionFromHeaders` in the web's `lib/region.ts`, and the web's two YouTube key patterns now read core's `YOUTUBE_VIDEO_KEY`. The guard tests `lib/region-boundary.test.ts` and `lib/api/v1/with-v1.test.ts` list the new routes.

## Inspected

- **Web extras**: `lib/tmdb/extras.ts` (one TMDB request per title with `videos`, `recommendations`, `watch/providers` and the age ratings appended, no region sent), `lib/tmdb/normalize-extras.ts` (`pickTrailer`, the three provider groups, the per country certification, the recommendations page with adult titles dropped), `getMovieExtras` and `getTvExtras` in `lib/tmdb/reads.ts` (`use cache`, `cacheLife("hours")`).
- **Web UI**: `components/catalog/title-extras.tsx` (trailer, age pill, Where to watch and More like this each in its own boundary; a failed read hides the trailer and pill and shows a one line error in the two sections), `where-to-watch.tsx` (heading names the country, groups Stream, Free, Rent or buy, "Not streaming in {country} right now.", "All options on TMDB", `JUSTWATCH_ATTRIBUTION`), `trailer-button.tsx` (YouTube embed dialog), `AgeRatingChip` in `title-details.tsx`, `components/game/game-more-like-this.tsx` (similar ids through `getGamesByIds`, hidden games dropped, order kept, cap `ROW_SIZE` 12).
- **Web order**: movie: hero (age pill, Trailer in the actions), tracking, overview, crew, Where to watch, Cast, More like this, Facts. Show: hero, tracking, overview, crew, seasons, Where to watch, Cast, More like this, Facts. Game: hero (Trailer), More like this before its facts.
- **Region**: `lib/region.ts` reads `x-vercel-ip-country` through core's `parseRegion` (`US` fallback); `app/AGENTS.md` says never store, log or send it to TMDB.
- **v1**: `withV1` (`lib/api/v1/with-v1.ts`) takes any `Cache-Control` string for a public route; `v1CatalogItemSchema` and `itemFromMovie`, `itemFromShow`, `itemFromGame` in `lib/api/v1/browse.ts` already shape cards; `v1GameSchema` already has `trailer` and `similarGameIds`.
- **App**: `movie-screen.tsx`, `show-screen.tsx`, `game-screen.tsx` (their doc comments say the extras wait for this slice), `DetailHeader` (hero pills), `LandingSection` and `PosterCard` (the horizontal card row), `PosterRowSkeleton`, `GlassPill`, `about-screen.tsx` (opens links with `Linking.openURL`).

## Skills used

`expo-router` (links to title routes), `vercel-react-native-skills` and `react-native-best-practices` (the horizontal row, image cost), `tanstack-query` (the extras query beside the title query), `react-native-testing` (RNTL v14), `vitest` for the route tests. Before the code, the SDK 58 `expo-linking` docs, as `apps/mobile/AGENTS.md` asks.

## Decisions and assumptions

Decided with you on 2026-11-24:

1. **Region: the IP country, as on the web.** The extras route reads `x-vercel-ip-country` through core's `parseRegion` (a shared helper beside `lib/region.ts`, since the route has the request in hand) and answers only that country's providers and age rating, plus the region's code and name. The country is never stored, logged or sent to TMDB. Because the answer differs by country, it goes out `private, max-age=300` (no shared CDN copy); the TMDB read underneath stays the cached `getMovieExtras` or `getTvExtras`, so TMDB is still asked once per cache lifetime.
2. **Trailer: open in YouTube.** The Trailer button opens `https://www.youtube.com/watch?v={key}` with `Linking.openURL`, which hands it to the YouTube app or the browser. No new dependency, no native rebuild, nothing reaches YouTube until pressed. The key is checked against the web's pattern again in the core schema, so a bad key never builds a URL.
3. **Games too.** The game screen gets its Trailer button (from the v1 game read it already has) and More like this through a new `GET /api/v1/games/{id}/similar`, which reads the game's `similarGameIds` and turns them into cards exactly like the web's section (one `getGamesByIds` batch, the web's order, hidden and missing games dropped before the cap of 12). Public, `s-maxage=300` like the other catalog reads.

Mine, following the web and the earlier slices:

4. **One extras route per media type**: `GET /api/v1/movies/{id}/extras` and `GET /api/v1/shows/{id}/extras`, answering `{ region: { code, name }, trailer: { key, name } | null, ageRating: string | null, watch: { link, stream, free, rentOrBuy } | null, recommendations: V1CatalogItem[] }`. Providers are `{ id, name, logoUrl }`. Recommendations are capped at 12, adult titles already dropped by the normalizer. Not found answers 404, a TMDB failure 502, both `no-store`, as the other catalog routes. The schema lives in `packages/core/src/api/v1/extras.ts`.
5. **The extras never block the title.** The screen reads the title and the extras as two queries. While the extras load or after they fail, the trailer and age pill are absent (as on the web); Where to watch and More like this show a skeleton while loading and a one line error with Try again on failure, keeping the rest of the screen.
6. **Placement follows the web's order** inside the slice 2 layout: the age pill joins the hero's pills; the Trailer button sits with the hero, above the tracking actions, so the actions keep their thumb reach (slice 2, decision 5; checked again at 375 by 812); Where to watch and More like this go where the web puts them. More like this reuses the Home row card (`PosterCard` at the row width) in a horizontal list with no See all; its cards carry no tracking badge, like Home's today (per card state is slice 4).
7. **Where to watch** mirrors the web: the heading names the country ("Where to watch in Poland"), each group only when it has a provider, provider logos as 48pt rounded images named for VoiceOver (a name pill when TMDB has no logo), "Not streaming in {country} right now." when empty, "All options on TMDB" opening TMDB's watch page with `Linking.openURL`, and the JustWatch credit from core. The copy moves into core (`catalog/extras-copy.ts` or the existing messages file) so both apps say the same words; the web reads it from there too.
8. **Age pill** is a `GlassPill` with the rating as text and the spoken label "Age rating in {country}: {rating}", as the web's.

Assumption: a phone request through Vercel gets `x-vercel-ip-country` like a browser does (it is set at the edge for every request). Locally there is no header, so the app shows `United States`, as the web does.

## Expected files

New:
- `packages/core/src/api/v1/extras.ts` and `extras.test.ts` (the extras and similar games schemas, the trailer key pattern).
- `apps/web/app/api/v1/movies/[id]/extras/route.ts`, `apps/web/app/api/v1/shows/[id]/extras/route.ts`, `apps/web/app/api/v1/games/[id]/similar/route.ts`, with tests.
- `apps/web/lib/api/v1/extras.ts` (the shared mapping from `MovieExtras` or `TvExtras` plus a region to the v1 body) and its test.
- `apps/mobile/src/lib/extras.ts` (`fetchMovieExtras`, `fetchShowExtras`, `fetchSimilarGames`, keys under `catalogKeys`, so sign out keeps them).
- `apps/mobile/src/components/title-extras.tsx`: `TrailerButton`, `AgeRatingPill`, `WhereToWatch` (with skeleton and error), `MoreLikeThis` (row, skeleton, error), with tests.

Changed:
- `packages/core/src/catalog/region.ts` callers: a `regionFromHeaders` helper used by both `lib/region.ts` and the extras routes (one region rule).
- `packages/core` copy for Where to watch, and `apps/web/components/catalog/where-to-watch.tsx` reading it.
- `apps/mobile/src/lib/catalog.ts` (the new keys), `src/screens/movie-screen.tsx`, `show-screen.tsx`, `game-screen.tsx`, `src/components/detail-header.tsx` (an age pill slot).
- `apps/web/app/api/v1/routes.test.ts` (route coverage list, if it enumerates routes).
- `apps/mobile/AGENTS.md` (the extras rule), `docs/scope/scope.md` (slice 3 boxes).

No migration, no new dependency, no native rebuild.

## Requirements

1. Every value shown comes from the v1 extras or game reads; a missing trailer, age rating or provider group hides itself, never "Unknown" (AGENTS.md section 14).
2. Where to watch and the age pill use the same country, from the one region rule, and the heading and spoken label name it (spec 0022, AC-9).
3. The region is never stored, logged or sent to TMDB, and a region specific answer never reaches a shared cache (`private`).
4. A failed or slow extras read never blocks or breaks the title screen.
5. The Trailer button opens YouTube only when pressed, with a key that matched the pattern.
6. TMDB's watch data carries the JustWatch credit; community ratings on the cards stay amber TMDB or IGDB pills (section 9).
7. Every new control is 44pt, labelled for VoiceOver; provider logos are named, decorative images hidden.
8. Old app builds keep working: only new routes, no field removed.
9. No colour literal, no `react-native` `Text` import (the boundary tests).

## Security considerations

All three routes are public and anonymous and read only the id. The extras answer is `private, max-age=300` because it depends on the connection's country; the country is read from Vercel's header, validated by `parseRegion`, and never logged, stored or forwarded. The TMDB token and IGDB credentials stay in `lib/tmdb/env.ts` and `lib/igdb/env.ts`; the routes call the existing cached reads. YouTube is already in `PROCESSORS`; opening its page is a link the user presses, so no change to `/privacy`, the store answers or `LEGAL_LAST_UPDATED`. External URLs the app opens are built from validated values only (the trailer key pattern, TMDB's watch link from the normalizer).

## Acceptance criteria

- **AC-1**: A movie or show with a trailer shows a Trailer button that opens the YouTube video; with none there is no button. A game with an IGDB trailer does the same.
- **AC-2**: The hero shows the age rating for the visitor's country as a glass pill, spoken as "Age rating in {country}: {rating}"; with none for that country, no pill.
- **AC-3**: Where to watch names the country, lists Stream, Free and Rent or buy with logos, links to all options on TMDB and credits JustWatch; with no providers it says "Not streaming in {country} right now."
- **AC-4**: More like this shows up to 12 recommendations (movie, show) or similar games (game) as tappable cards that open the title; with none the section is absent.
- **AC-5**: When the extras read fails, the title screen still loads, the trailer and pill are absent, and Where to watch and More like this show an error line with Try again that refetches only the extras.
- **AC-6**: The extras answer is `private`, the similar games answer is public `s-maxage=300`, errors are `no-store`; an invalid id is 400, an unknown title 404.
- **AC-7**: On a 375 by 812 screen the tracking actions are still visible without scrolling on a movie, a show and a game.
- **AC-8**: `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (core schema tests, the three route tests, the region helper, the mobile component and screen tests), `pnpm build` (new route handlers). From `apps/mobile`: `npx expo-doctor`.

## Manual test steps

1. `orb start`, then `pnpm exec supabase start`; `pnpm dev:docker` from the repo root.
2. Move `apps/mobile/.env.development.local` aside if it holds a LAN address, then from `apps/mobile` run `npx expo start --dev-client` and open the existing development build in the iOS Simulator (no rebuild needed).
3. Open a movie with a trailer (for example Dune: Part Two): the age pill is in the hero ("PG-13" for United States locally), Trailer opens YouTube in Safari or the YouTube app; Where to watch in United States lists providers, "All options on TMDB" opens TMDB, the JustWatch credit shows; More like this cards open their titles.
4. Open a show (for example Severance): the same sections, in the web's order around the seasons and cast.
5. Open a game with a trailer and similar games (for example Hades II): Trailer opens YouTube, More like this shows game cards that open.
6. Turn the network off after a title has loaded, pull to refresh or open another title: the extras sections show their error line with Try again, the title still shows; turn it back on and press Try again.
7. Open a title with no providers or no trailer: the empty line shows, and no Trailer button.
8. Turn on VoiceOver: the age pill reads "Age rating in United States: …", each provider logo reads its name, and every button reads its label.
9. Compare a movie with the web at 375px in the browser pane for material, colour, radius and type.
