# Verify: Richer game page · spec 0031 · updated 2026-10-26
_Steps derived from spec 0031 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Open `/games/1942` (The Witcher 3) at 1280px → the hero, then `Overview`, `Screenshots`, `More like this`, `Facts`, in that order → AC-1
- [x] Open `/games/94975` (Wubble Bubbles, no extra IGDB data) → the hero alone: no backdrop, no Trailer button, no `h2` at all → AC-1, AC-3, AC-11
- [x] On `/games/1942`, the hero shows a wide art backdrop whose request goes to `images.igdb.com` (no `/_next/image` request in the network panel) → AC-3, AC-13
- [x] On `/games/1942`, press Trailer → a dialog labelled `The Witcher 3: Wild Hunt trailer` opens with a `youtube-nocookie.com` iframe for `5nLipy-Z4yo` (the lowest id trailer, not a gameplay one); before pressing, no iframe exists → AC-4
- [x] Overview shows the summary with its blank line kept, an `h3` `Story` with the storyline, `Developed by CD Projekt RED`, and `Published by` in IGDB's order → AC-5
- [x] Screenshots shows 12 thumbnails, each a button named `Open screenshot {n} of 12`, images with `alt=""`, loaded lazily → AC-6
- [x] Open thumbnail 3 → dialog `The Witcher 3: Wild Hunt screenshots`, `3 of 12`, focus on Close, one image in the dialog; ArrowRight shows `4 of 12`; Escape closes and focus lands on `Open screenshot 4 of 12`, scrolled into view → AC-7
- [x] In the dialog, Previous is disabled on image 1 and Next on image 12; no wraparound → AC-7
- [x] More like this shows up to 12 G8 cards in IGDB's `similar_games` order (Elden Ring first on 2026-10-26), with no See all; a card's bookmark works signed in → AC-8
- [x] Block `api.igdb.com` for the batch only (or force an `IgdbError`) → the More like this heading stays with `Couldn't load similar games from IGDB.` and a Try again link to `/games/1942` → AC-8 (2026-10-26: an `IgdbError` forced after the batch in a local edit, then reverted)
- [x] Facts lists Game modes, Player perspectives, Themes, Franchise, Series, Game engine, Release dates; Release dates starts `PC (Microsoft Windows): May 19, 2015` and ends `Nintendo Switch 2: Sep 29, 2026` → AC-9, AC-10
- [x] Find a game with a quarter and a TBD release (IGDB `release_dates` with `date_format` 3 to 7) → its Facts show `Q1 2027` style and `TBA` last → AC-10
- [x] At 375px and 1280px, `/games/1942` and the open dialog: no horizontal page scroll, 44px Previous, Next and Close, visible focus, the dialog usable by keyboard alone → AC-15
- [x] `/showcase` (dev) shows "Game page sections": the Overview with and without a storyline, the screenshot row and dialog, and Facts with a quarter date and TBA → AC-16

## Value sourcing
- [x] Backdrop: a game with artworks uses the lowest artwork `image_id`; a game with only screenshots uses the lowest screenshot → AC-3 (2026-10-26: `/games/1942` loads `ar3lzb`, the lowest of 16 artworks; `/games/19258` Sonic Rush, no artworks, loads `sc8hmp`, the lowest screenshot)
- [x] Trailer dialog title is the game's name, iframe title uses IGDB's video name → AC-4
- [x] `{total}` in the thumbnail names equals the number of thumbnails (12 cap) → AC-6
- [x] More like this ids are exactly `similar_games` without the game's own id; a hidden game never takes a slot → AC-8 (2026-10-26: `/games/1942` links the 10 `similar_games` ids in IGDB's order, none hidden that day; the hidden case is held by `game-more-like-this.test.tsx`)
- [x] Release date quarter comes from `date_format`, the year from the UTC timestamp → AC-10
- [x] Franchise label turns `Franchises`, engine label `Game engines`, only when there is more than one → AC-9 (2026-10-26: `/games/500` reads `Franchises` and `Game engine`, `/games/20` `Franchise` and `Game engines`)

## Commands
- [x] `pnpm build` → `/games/[id]` listed as `◐` (partially prerendered) and no IGDB call during the build → AC-12
- [x] `pnpm igdb:live` → passes the new field, `date_formats` and quarter checks → AC-14
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint:ci` → green → AC-2, AC-12

## Acceptance-criteria coverage
- AC-1 first two UI steps · AC-2 commands + `games.test.ts` · AC-3 backdrop steps · AC-4 trailer step · AC-5 overview step · AC-6 thumbnails step · AC-7 dialog steps · AC-8 More like this steps · AC-9 and AC-10 Facts steps · AC-11 bare game step · AC-12 build · AC-13 network step · AC-14 live check · AC-15 375 and 1280 step · AC-16 showcase step
