# Verify: game cards everywhere · spec 0030 · updated 2026-10-26
_Steps derived from spec 0030 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run against `pnpm dev:docker` (the local stack), signed in as `user-a@example.test` / `password-a`, unless a step says signed out.

## UI / manual
- [x] Open `/search?type=game&q=witcher` signed in, and watch the network or the database log: the grid runs one `user_game_state` query for all its ids → AC-1
- [x] Open `/games` signed in: every section card (posters, the Coming soon wide cards, the Top rated rows) has a bookmark or a chip; one query per section → AC-1
- [x] Open `/games/popular` signed in: every card has a bookmark or chip; one query for the page → AC-1
- [x] Make a game Playing with score 8 on its page, then find it on `/search?type=game`: the cyan 8 replaces the IGDB rating and a `Playing` chip shows with no button → AC-2, AC-6
- [x] Make a game Finished with no score: the amber IGDB rating stays and a `Finished` chip shows → AC-2, AC-6
- [x] On a card with no status, tap the bookmark: it turns green and pressed at once, its name reads `Want to play: {name}`, and no toast shows → AC-3, AC-5
- [x] Tap the pressed bookmark: it empties, the toast reads "Removed from your games.", Undo presses it again and the game is back on `/watchlist?type=game` → AC-3, AC-5
- [x] Tap a bookmark twice quickly: the second tap does nothing while the first write runs (the button is disabled) → AC-4
- [x] Sign out in another tab, then tap a bookmark: it rolls back and the toast offers Sign in, which returns to the same grid URL (query string included) → AC-4
- [x] Stale card: open `/search?type=game` in tab A; in tab B make that game Playing with a score; in tab A tap the unpressed bookmark: the toast reads "Moved to Want to play. Your score was removed.", and Undo restores Playing and the score → AC-5
- [x] Remove a wanted game in tab B, then tap its pressed bookmark in tab A: a quiet success with no Undo toast → AC-5
- [x] Want to play a game releasing after today (UTC): the release pill with its date shows beside the pressed bookmark; a game with no IGDB date shows Date TBA; a released wanted game shows no pill; an unpressed or started card never shows the pill → AC-7
- [x] On `/games/coming-soon` press a bookmark: the card still shows exactly one date pill; on the `/games` Coming soon wide cards, the same → AC-7
- [x] A game shown pressed on any grid is on `/watchlist?type=game`; a Playing chip is on `/upcoming?type=game`; a Finished chip is on `/watched?type=game` → AC-8
- [x] Signed out, open `/games`, `/games/popular` and `/search?type=game`: IGDB ratings only, no bookmark, chip or personal pill → AC-9
- [x] Stop the local stack's database (or break the read) and reload a grid signed in: plain catalog cards and one `game_tracking.read refused db_error` log line per grid read, not per card → AC-9
- [x] Poster cards on `/games` sections, the list pages and `/search` show the release year under the name, and none when IGDB has no year; wide cards and Top rated rows show no meta line → AC-10
- [x] On `/watchlist?type=game`, the card shows the green bookmark named `Remove {name} from Want to play`; tapping it removes the card with the same Undo toast; a hidden game keeps it; a missing game keeps the X → AC-11
- [x] On `/upcoming?type=game` and `/watched?type=game`, each card shows the `Playing` or `Finished` chip left of the X named `Remove {name} from your games` → AC-11
- [x] The footer icon key reads `Plan / Want to play` and `Planned / Want to play` → AC-12
- [x] With a slow network, game covers on `/games`, the list pages and `/search` paint before the badges and controls arrive → AC-13
- [x] Load `/games`, `/games/popular` and `/search?type=game` and check the database: no row is written by loading → AC-14
- [x] `/showcase` shows the Game card section with all seven states; Tab reaches a bookmark, Enter and Space toggle it, the focus ring is visible → AC-15
- [x] At 375px and 1280px, the card bottom rows fit (pill plus bookmark, chip plus X) without overlap → AC-15

## Value sourcing
- [ ] Grid read ids: a grid's ids are its own results (search page, list page, landing section), never another section's → AC-1
- [ ] Personal score: a Want to play row never shows a score badge even if one were stored → AC-2
- [x] Community rating: the fallback badge shows IGDB's rating (`GameSummary.communityRating` or `LandingItem.rating.value`), labelled IGDB → AC-2
- [x] Pressed: only `status = want_to_play` presses the bookmark → AC-3
- [ ] Release gate: a game releasing on today's UTC day counts as released (no pill); one releasing tomorrow UTC shows the pill. Check across a local timezone that is a day ahead of UTC → AC-7
- [x] Return path: a session expired Sign in from `/games` returns to `/games`, from a list page to that page, from `/search` to the full search URL → AC-4
- [x] Library status: the library card's chip text comes from the tab's stored status → AC-11

## Commands
- [x] `pnpm typecheck` → passes
- [x] `pnpm lint` → passes
- [x] `pnpm test` → all suites pass
- [x] `pnpm build` → `/games`, every `/games/{slug}` and `/search` stay ◐ (partial prerender) → AC-13

## Acceptance-criteria coverage
- AC-1 grid read steps, value sourcing ids · AC-2 started and badge steps · AC-3 bookmark steps · AC-4 double tap, session expired, return path · AC-5 Undo, stale card, quiet removal · AC-6 chip steps · AC-7 pill steps, UTC day · AC-8 library match · AC-9 visitor and failed read · AC-10 year meta · AC-11 library tabs · AC-12 icon key · AC-13 shell and build · AC-14 no write on load · AC-15 showcase, keyboard, widths
