# Verify: Games tab and library pages · spec 0027 · updated 2026-10-24
_Steps derived from spec 0027 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Setup: start the local stack, then run the app with `NEXT_PUBLIC_GAMES_LIBRARY=on` (for example `NEXT_PUBLIC_GAMES_LIBRARY=on pnpm dev:docker`). Sign in as `user-a@example.test` / `password-a`. Give user A games in all three statuses (the seed has The Witcher 3 on Playing with a score and Elden Ring on Finished; add a Want to play game, an unreleased Want to play game, and a made up id such as `999999991` for the missing card). Run `pnpm exec supabase db reset` when you finish, before `pnpm test:db`.

## UI / manual
- [x] Open `/watchlist?type=game` → the navbar reads SHOWS | MOVIES | GAMES with GAMES lit (`aria-current="page"`), the Library links carry `type=game`, and there is no navbar search field or mobile search icon → AC-3, AC-4
- [x] On `/shows`, `/movies`, `/movies/550` and `/search` → only SHOWS | MOVIES, never GAMES → AC-3
- [x] On a games tab, the logo links to the catalog last viewed (`/shows` by default), and `localStorage["bestats:last-media-type"]` never becomes `game` → AC-4
- [x] `/watchlist?type=game` lists Want to play games, newest added first, each with its cover, a name linking to `/games/{id}` and the amber IGDB community rating → AC-6, AC-8
- [x] An unreleased Want to play game shows its release pill (`Feb 3, 2027` style), or Date TBA with no date; a game out today or earlier shows no pill → AC-8
- [x] `/upcoming?type=game` lists Playing games, newest started first: the cyan score when scored, else the amber community rating, and a `Started {Mon YYYY}` line → AC-6, AC-9
- [x] `/watched?type=game` lists Finished games, newest finished first, with `Finished {Mon YYYY}` → AC-6, AC-9
- [x] The month line uses the UTC month: a `finished_at` of `2026-11-01T01:00+02:00` reads `Finished Oct 2026` → AC-9 (value sourcing: `finished_at` through `formatMonthYear`)
- [x] A game IGDB hides keeps its card but its name is plain text, not a link → AC-10
- [x] A made up id shows a "No longer on IGDB" card at its place in the order, with no badge, no date line, and a working remove button → AC-11
- [x] With 30 Finished games: page 1 shows 24, page 2 shows 6, and `?type=game&page=5` redirects to `?type=game&page=2` → AC-6
- [x] Remove a Playing game → the card goes at once, focus moves to the next card's link (or the previous, or the heading), and the toast `Removed from your games.` offers Undo → AC-12, AC-13
- [x] Undo within 10 seconds → the card comes back in its old place with its score and its Started month unchanged → AC-12
- [x] Remove the same game in a second tab after the first → a quiet success, no toast → AC-12
- [x] Sign out in another tab, then remove a game → the card comes back and the toast's Sign in returns to this page's URL with `type` and `page` → AC-12
- [x] Remove the last card of page 2 → the page redirects to page 1 and the heading takes the focus → AC-13
- [x] Each empty games tab shows its text only empty state (`No games to play yet`, `Nothing in progress`, `No finished games yet`) with no button → AC-14
- [x] Block IGDB (for example a bad `IGDB_CLIENT_SECRET`) → "Couldn't reach IGDB" with Retry to the same URL, never the empty state → AC-7
- [x] Stop the local database while signed in → the list's own "Couldn't load your …" panel with Retry → AC-7
- [x] At 375px and 1280px: 2 and 6 columns, nothing scrolls sideways, the three tabs fit, every button keeps a 44px tap target; keyboard alone can open a game, remove one and reach Undo → AC-16
- [x] `/showcase` → the Game library card section shows every state of AC-17 → AC-17
- [x] Signed out, open `/upcoming?type=game` → sent to sign in, no game data in the response → AC-15
- [x] Load each games tab and confirm in the Supabase logs that no write ran → AC-15

## Flag off
- [x] Run without `NEXT_PUBLIC_GAMES_LIBRARY` (or `off`) → no GAMES tab anywhere, and `/watchlist?type=game` shows "That page doesn't exist" with Back to Watchlist → AC-1, AC-3, AC-5
- [x] Set it to `maybe` → the navbar still renders on every page without GAMES, and the library pages show the error boundary → AC-1, AC-5

## Commands
- [x] `pnpm typecheck` → passes, including the `@ts-expect-error` on `typedHref("/search", "game")` → AC-2, AC-18
- [x] `pnpm lint:ci` → no errors → AC-18
- [x] `pnpm test` → passes → AC-18
- [x] `pnpm build` → passes, the three library routes still partial prerender → AC-18
- [x] `pnpm exec supabase db reset && pnpm test:db` → passes unchanged → AC-18
- [x] `git diff main -- supabase/ lib/supabase/database.types.ts` → empty → AC-18
- [x] `vercel env ls preview` lists `NEXT_PUBLIC_GAMES_LIBRARY`; `vercel env ls production` does not → AC-1

## Acceptance-criteria coverage
- AC-1 flag off steps, Commands (Vercel) · AC-2 Commands (typecheck), `media-type.test.ts` · AC-3 first two UI steps · AC-4 first and third UI steps · AC-5 flag off steps · AC-6 tab order and paging steps · AC-7 IGDB and database failure steps · AC-8 Want to play steps · AC-9 Playing, Finished and UTC month steps · AC-10 hidden step · AC-11 missing step · AC-12 removal, Undo, second tab and session steps · AC-13 focus and redirect steps · AC-14 empty state step · AC-15 signed out and no write steps · AC-16 sizes step · AC-17 showcase step · AC-18 Commands
