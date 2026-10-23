# Verify: Game page (tracer) · spec 0025 · updated 2026-10-23
_Steps derived from spec 0025 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run `pnpm dev` with `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in `.env.local`. No sign in is needed; the page is public.

## UI / manual
- [ ] Signed out, open `/games/1942` → one `h1` "The Witcher 3: Wild Hunt", the cover, no backdrop, no tagline, then the meta row, the platforms line and the IGDB rating block, in that order → AC-1
- [ ] On `/games/1942`, the meta row reads the full UTC date (`May 19, 2015`) with no release kind label (a main game), then the genre chips, which are not links → AC-2
- [ ] Open a remake or remaster (for example Resident Evil 3, 2020) → the date is followed by ` · Remake` (or `Remaster`) → AC-2
- [ ] The platforms line reads `Platforms: ` and the names sorted by name, ignoring case, joined by `, `, and wraps at 375px → AC-3
- [ ] The rating block shows the amber star badge with one decimal, the word `IGDB` and the count (`5,501 votes`); a screen reader hears "IGDB rating" before the number → AC-4
- [ ] Open a game with no cover, no date, no genres, no platforms or no rating (or check `game-hero.test.tsx`) → the controller icon tile, no date part or separator, no chips, no platforms line, `No IGDB rating yet`; never `TBA`, `0` or today's date → AC-5
- [ ] Open `/games/abc`, `/games/0550`, `/games/+5`, `/games/5.0`, `/games/2147483648` and `/games/1.jpg` → each answers status 404 with the site's 404 page → AC-6
- [ ] Open `/games/2147483647` (unknown) and a DLC id such as `/games/12503` (hidden) → status 200, "We couldn't find that game" with a Go to home button linking to `/`, tab title `Game not found`, `noindex` → AC-7
- [ ] Start the dev server with `IGDB_CLIENT_ID= IGDB_CLIENT_SECRET=` (empty) and open `/games/1942` → "Couldn't reach IGDB" with a Try again link to `/games/1942`, tab title `Game`, `noindex` → AC-8
- [ ] Throttle the network and reload `/games/1942` → the skeleton has no backdrop band and no tagline line, a screen reader hears "Loading game details", and the hero lands without a jump → AC-9
- [ ] View source on `/games/1942` → title `The Witcher 3: Wild Hunt (2015) · BeStats`, a description cut at a word within 160 characters, `<meta name="robots" content="noindex">`, no canonical, no `og:image`, no JSON-LD → AC-10
- [ ] In the network panel on `/games/1942`, the cover loads straight from `images.igdb.com`, never `/_next/image`; the `srcset` steps through `t_cover_small`, `t_cover_small_2x`, `t_cover_big` and `t_cover_big_2x`; a movie page still loads TMDB sizes → AC-11, AC-12
- [ ] At 375px and 1280px, on the found, not found and error states: no horizontal scroll, the `h1` wraps, Try again and Go to home are 44px tall and show a focus ring on Tab → AC-13

## Value sourcing
- [ ] Name, cover, date, genres, platforms, rating and count on `/games/1942` match IGDB's record for id 1942 (the date as IGDB's UTC day, not the local day) → AC-1 to AC-4
- [ ] The release kind label follows `gameType`: change the fixture in `game-hero.test.tsx` and only the four listed types add a label → AC-2
- [ ] A hidden game (`hidden: true`) and an IGDB `not_found` both give the soft 404; any other `IgdbError` gives the retry panel → AC-7, AC-8
- [ ] The tab title year comes from `releaseYear` and the description from `summary` → AC-10
- [ ] `/games/2147483647` passes the proxy and `/games/2147483648` gets the real 404, matching G2's `integer` column → AC-6
- [ ] The loader's rung for a width comes from `IGDB_COVER_LADDER`, never past the URL's own size → AC-12

## Commands
- [ ] `pnpm typecheck` → no errors → AC-9
- [ ] `pnpm lint` → no errors (only the existing fragment infos) → AC-13
- [ ] `pnpm test` → all pass, including `game-hero.test.tsx`, `load-game.test.ts`, `page.test.ts`, `proxy.test.ts`, `lib/images/*.test.ts`, `next.config.test.ts` → AC-1 to AC-12
- [ ] `pnpm igdb:live` → passes, including every cover rung answering 200 at its stated pixel width → AC-12
- [ ] `pnpm build` → the route table lists `/games/[id]` as `◐` (partially prerendered) → AC-9

## Acceptance-criteria coverage
- AC-1 to AC-5: UI steps 1 to 6, value sourcing 1 and 2, `game-hero.test.tsx`
- AC-6: UI step 7, value sourcing 5, `proxy.test.ts`, `ids.test.ts`
- AC-7, AC-8: UI steps 8 and 9, value sourcing 3, `load-game.test.ts`
- AC-9: UI step 10, `pnpm build`
- AC-10: UI step 11, value sourcing 4, `page.test.ts`
- AC-11, AC-12: UI step 12, value sourcing 6, `lib/images/*.test.ts`, `pnpm igdb:live`
- AC-13: UI step 13
