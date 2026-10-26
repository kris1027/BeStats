# 0030. Game cards everywhere

**Date**: 2026-10-26
**Status**: Accepted

## Summary

Game cards on the games landing, the list pages and `/search` stop being plain covers. A signed in user sees their own state on every one: their score as the badge when they have one, a Want to play bookmark they can tap, a release pill on a wanted game that is not out yet, and a small read only Playing or Finished chip on a game they have started. Each grid reads the user's games once, in one query, the way movie grids do. On the library tabs the Want to play card gets the same green bookmark (which removes the game), and Playing and Finished cards get the chip next to their remove button.

## Requirements

**User stories**:
- As a signed in user browsing games, I want to see which games are already mine and how I scored them, so I never have to open a game to find out.
- As a signed in user, I want to add a game to Want to play straight from its card, and take it off again, so building a list is quick.
- As a visitor, I want game cards to stay fast and clean, with no controls I cannot use.

**Acceptance criteria** (the contract):
- **AC-1**: Every game card on `/games` (every landing section card: `LandingPoster`, the Coming soon `WideCard` and the `TopRatedList` rows; the hero keeps its `GameTrackingSlot`), on the five `/games/{slug}` list pages and on `/search?type=game` gets its personal state from one grid read: `getGameGridStates(gameIdsKey(ids))`, wrapped in React `cache()`, so each grid (one landing section, one list page, one results page) runs one `user_game_state` query for all its ids. `/games` therefore runs one query per section (about five), as the movie landing does. Never inside `use cache`, never in a page shell.
- **AC-2**: The badge follows the games library card rule: the cyan `PersonalScoreBadge` when the game is Playing or Finished and has a score, otherwise the amber `IgdbRatingBadge` (nothing when IGDB has no rating). While the read is pending, and for a visitor or a failed read, the card shows the IGDB rating.
- **AC-3**: A signed in user's card with no status, or with Want to play, shows the round bookmark in the bottom row: `PlanIcon` unpressed, the green `PlannedIcon` pressed, `aria-pressed` set, accessible name `Want to play: {name}`. Tapping it unpressed calls `setGameStatus(id, "want_to_play")`; tapping it pressed calls `removeGame(id)`.
- **AC-4**: The bookmark is optimistic: it flips at once and is `disabled` while its write is in flight, so two quick taps can never land out of order. A failed write rolls it back (the `useOptimistic` value ends with the transition) and shows the existing game error toast (`showGameTrackingError`, control `status`), including the session expired Sign in action that returns to the grid's page. The release pill and the badge follow the confirmed state the action's `refresh()` delivers, not the optimistic flip.
- **AC-5**: Every bookmark result's `undo` goes to `showGameUndo` (toast id `game-undo-{id}`), with `restoring` setting the bookmark back at once. Removing shows the removed message and Undo restores the row. Adding from no row returns no Undo and shows no toast. Adding over a stale card (another tab made the game Playing or Finished with a score) returns the score cleared Undo, so the score is never lost silently. A removal another tab already made is a quiet success with no Undo.
- **AC-6**: A Playing or Finished game's card shows a read only glass chip reading `Playing` or `Finished` (from `GAME_STATUS_LABELS`) in the bottom row and no button. The card offers no way to change a started game's status or score.
- **AC-7**: The release gate shows on the card: a Want to play game whose UTC release day (`isGameReleased(releaseDate, requestTodayUtc())`) has not come shows the `ReleasePill` with its date, or Date TBA when IGDB has none, next to the pressed bookmark. Only a Want to play card shows this pill, never an unpressed or started one. Cards that already print the date for everyone (the landing Coming soon `WideCard`, whose controls already get `releasePill={false}`, and the `/games/coming-soon` list, whose `GameListCard` keeps printing the `releaseDay` pill for visitors too) do not print it twice: the slot skips its pill whenever the card already prints one. `requestTodayUtc()` is read only inside the slot's Suspense boundary. The bookmark itself is never gated, because Want to play is allowed before release.
- **AC-8**: A card's status always matches its library page: Want to play on `/watchlist?type=game`, Playing on `/upcoming?type=game`, Finished on `/watched?type=game`. Both read the same stored row, and no card derives a status from anything else.
- **AC-9**: A signed out visitor, a clone with no Supabase configuration (`publicEnvProblems()`), and a failed grid read all get the plain catalog card: IGDB badge, no bookmark, no chip, no pill from the personal slot. A failed read is logged once inside the read, never shown on every card.
- **AC-10**: Every game card in a `PosterCard` shows the release year as its meta line (`releaseYear`, left out when IGDB has none) on the landing (`LandingPoster`), the list pages and `/search`. The `WideCard` and `TopRatedList` rows get the badge and controls (AC-1) but no meta line, keeping their own layouts.
- **AC-11**: On the library tabs, the Want to play card (hidden games included) replaces its X with the green `PlannedIcon` round button, accessible name `Remove {name} from Want to play`, running the same optimistic removal, Undo and removal focus `GameLibraryGrid` already owns. Playing and Finished cards show the read only status chip left of the X, which keeps `Remove {name} from your games`. The missing game card keeps the X. The card learns the status from a new `status` field on `LibraryGameItem`, set in `gameLibraryTab`.
- **AC-12**: The icon key's two bookmark entries read `Plan / Want to play` and `Planned / Want to play`. No new mark is added.
- **AC-13**: The page shells stay prerendered: `/games`, every `/games/{slug}` and `/search` keep their static shell, and each personal slot sits in its own Suspense boundary (badge fallback: the IGDB badge; controls fallback: nothing), so no cover waits on the session.
- **AC-14**: No page writes when it loads, and the cards add no `NEXT_PUBLIC_GAMES_LIBRARY` gate of their own, exactly as the game page's status control does (the routes keep the gates they have, such as `/search?type=game`).
- **AC-15**: `/showcase` renders the game card states (visitor, no status, Want to play released, Want to play unreleased, Want to play TBA, Playing scored, Finished unscored), the bookmark keyboard path works (Tab reaches it, Enter and Space toggle, focus ring visible), and the cards hold at 375px and 1280px.

## Decision

**Chosen option**: Option 1: Mirror the movie card slots for games

Give games the same shape movie cards have: one cached grid read, a pure card status function, a server badge slot and controls slot, and one small client bookmark, then plug those slots into `LANDING_SLOTS`, `GameListCard` and `GameLibraryCard`.

## Feature design

**Data model sketch**: no schema change. The read uses `user_game_state` (`user_id`, `game_id`, `status`, `rating`, timestamps) from spec 0024 as it is.

**State transitions on the card** (the card can make only these two; everything else stays on the game page):
- none → Want to play (`setGameStatus`)
- Want to play → none (`removeGame`, with Undo)
- Playing and Finished: no transition from the card.

**Surface** (no new endpoints; Server Actions from spec 0026 are reused as they are):

| Piece | Kind | Inputs | Output | Auth | Errors |
|---|---|---|---|---|---|
| `getGameGridStates(idsKey)` in `lib/tracking/game-state.ts` | server read, `cache()`, `publicEnvProblems()` first | sorted, deduped id string from `gameIdsKey`; `""` returns an empty map with no query | `TrackingRead<Map<number, GameTrackingState>>` (`{ status, rating }` per game id; at most one section or page of ids, 24 to 40) | optional session; `signed_out` with none | `failed` on a db error, logged once as `TRACKING_EVENT.gameRead` |
| `gameIdsKey(ids)` | pure | ids | key string | none | none |
| `gameCardStatus(state, releaseDate, today)` in `lib/catalog/game-page.ts` | pure | stored state or undefined, IGDB release date, UTC day | `null` (no row), `{ status: "want_to_play", unreleased: boolean }`, `{ status: "playing" or "finished", rating: number or null }` | none | none |
| `GameCardBadge`, `GameCardControls` in `components/tracking/game-card-slots.tsx` | async Server Components sharing one `readStatus`, as `movie-card-slots.tsx` does | `gameId`, `name`, `releaseDate`, `communityRating`, `gridGameIds`, `returnPath`, `releasePill` (default true) | badge or bottom row; the controls format the pill with `formatReleaseDate(releaseDate, requestTodayUtc())` | session through the read | catalog card on `failed` |
| `GameCardBookmarkButton` in `components/tracking/game-card-bookmark-button.tsx` | client | `gameId`, `name`, `inList`, `returnPath` | optimistic toggle, disabled while pending | Server Action rechecks the session | `showGameTrackingError` |
| `GameStatusChip` in `components/tracking/game-status-chip.tsx` | plain component (no `server-only` import, so the client library grid can render it), `GlassPill` | status | chip | none | none |
| `GameListCard` (new props) | server | adds `gridGameIds`, `returnPath`; keeps `releaseDay` (the list prints dates for everyone) and passes `releasePill={releaseDay === undefined}` to the controls | card | none | none |
| `LANDING_SLOTS` (new field) | config | `meta: ((item: LandingItem) => ReactNode) or null` | `LandingPoster` meta line | none | none; `tv` and `movie` set `null`, `game` returns `item.year ?? undefined` |
| `setGameStatus`, `removeGame`, `restoreRemovedGame` | existing Server Actions | as spec 0026 | `GameTrackingResult` | session, RLS | spec 0026 errors |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Grid read | the user's status and score per game | `user_game_state.status`, `.rating`, filtered by the session user and `game_id in ids` |
| Grid read | the ids | the grid's own results: `paged.results` on list and search pages, the section's `ids` on the landing |
| Badge | personal score | `rating` from the grid read, only on Playing or Finished |
| Badge | community rating | `GameSummary.communityRating` or `LandingItem.rating.value` |
| Bookmark | pressed | `status === "want_to_play"` from the grid read |
| Bookmark | accessible name | IGDB `name` already on the card |
| Release pill | released or not | `gameCardStatus(...).unreleased`, from `isGameReleased(releaseDate, requestTodayUtc())`, the UTC day rule of spec 0026 |
| Release pill | date text | `formatReleaseDate(releaseDate, requestTodayUtc())`; `null` date gives Date TBA |
| Release pill | shown at all | only on Want to play, and only when `releasePill` is true: false on the landing `WideCard` (already passed) and whenever `GameListCard` has a `releaseDay` (the `/games/coming-soon` list, `list.datedCards`) |
| Add over a stale card | score cleared Undo | `setGameStatus`'s `undo` (`kind: "status"`) |
| Chip | label | `GAME_STATUS_LABELS[status]` |
| Meta line | year | `GameSummary.releaseYear` or `LandingItem.year` (already `game.releaseYear`) |
| Toasts | return path | the grid's page: `CATALOG_PATHS.game` on the landing, the list page path, the current `searchHref(params)` on `/search` |
| Undo | previous row and `removedAt` | `removeGame`'s `undo` result |
| Library card | which status | new `LibraryGameItem.status`, set in `gameLibraryTab` from the stored row |

**Key invariants**:
- One grid read per grid; every card in it passes the same id array.
- The card never sets Playing or Finished and never sets a score, so the release gate and the score rule are enforced by never offering them; the Server Actions still check both.
- A visitor never gets a skeleton or a control they cannot use.
- The bookmark and the library Want to play button use the same glyphs and the same `removeGame` path, so Undo and toast ids match on every surface.

**Security model**: reads run under the user's session with owner only RLS (spec 0024); no elevated key. The read is per request and never shared (`AGENTS.md` section 11). Writes are the spec 0026 actions, which derive the user from the session and validate the id with Zod.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: signed in, a grid of 24 games with three of yours runs one query; tapping the bookmark on an unowned game presses it, and the game appears on `/watchlist?type=game`. Verifies AC-1, AC-3, AC-8.
- Remove and Undo: unpress a wanted game, see the toast, Undo, the bookmark is pressed again and the row is back. Verifies AC-5.
- Stale card: make a game Playing with a score in another tab, tap the unpressed bookmark here, see the score cleared toast, Undo restores Playing and the score. Verifies AC-5.
- Failure: the action fails (or the session expired), the bookmark rolls back and the toast offers Sign in; a second tap while pending does nothing. Verifies AC-4.
- Gate: an unreleased wanted game shows its pill; a TBA game shows Date TBA; on Coming soon the pill is not doubled. Verifies AC-7.
- Started games: Playing scored shows the cyan score and the chip, no button. Verifies AC-2, AC-6.
- Visitor and failed read: plain cards, one log line. Verifies AC-9.
- Shell: the build still prerenders the shells. Verifies AC-13.

## Build plan

Tracer Bullet: one real thread on one grid first, then the other grids, then the library.

1. [x] Thin thread: `gameIdsKey`, `getGameGridStates`, `gameCardStatus`, `GameCardBadge`, `GameCardControls` with `GameCardBookmarkButton` (disabled while pending, every `undo` to `showGameUndo`), wired into `GameListCard` on `/search?type=game` only, where `GameResults` passes `paged.results` ids itself and `returnPath = searchHref(params)`; unit tests for the read and the pure status, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-9**
2. [x] The started and unreleased cases: `GameStatusChip`, the release pill branch and the `releasePill` switch, satisfies **AC-6**, **AC-7**
3. [x] Every other grid: `GameListCard` on the five list pages through `CatalogListCards` (pass `gridGameIds`, `returnPath`, and keep `releaseDay` on coming soon so the slot skips its pill), the `game` entry in `LANDING_SLOTS` (badge, controls, `meta`), which also lights the `WideCard` and `TopRatedList` rows, and the `meta` field read by `LandingPoster`; update `landing-badge.test.tsx` (it asserts games have no slots) and the games cases in `landing-sections.test.tsx`, satisfies **AC-1**, **AC-8**, **AC-10**, **AC-13**, **AC-14**
4. [x] Library tabs: `LibraryGameItem.status` set in `gameLibraryTab`; Want to play gets the green bookmark remove button, Playing and Finished get the chip left of the X; update the accessible names `game-library-grid.test.tsx` and `game-library-tab.test.tsx` assert, satisfies **AC-11**
5. [x] Icon key labels and `/showcase` states, satisfies **AC-12**, **AC-15**
6. [x] Proof: build (the `/games`, `/games/{slug}` and `/search` shells still prerender), typecheck, lint, tests, 375px (chip plus X fits two columns) and 1280px, keyboard, signed out and signed in, satisfies **AC-13**, **AC-15**

## Consequences

**Positive**:
- Games reach parity with movies on every grid, and the scope's "cards everywhere" promise is met without new tables or actions.
- One query per grid, so a 24 card page costs one small indexed read.

**Negative / tradeoffs**:
- The card cannot move a game you have started; you open the game page or the library tab for that. Some users will look for it on the card.
- The Playing and Finished chip on the library tabs repeats what the tab heading already says.
- A Coming soon section on the landing and its list page now share a status read path with the rest, so a Supabase outage quietly drops personal state from every game card (by design, AC-9).

**Neutral**:
- `LANDING_SLOTS` gains a game `meta` entry; movie and show entries leave it empty.
- `GameListCard` keeps `releaseDay` for the visitor pill on Coming soon and derives the slot's `releasePill` from it.
- A stale card's bookmark can still demote a started game, guarded only by the score cleared Undo toast.

## Follow-up

- [ ] `/sync` after merge: the `components/AGENTS.md` lines that say the `game` landing entry is null until G8, and the root `AGENTS.md` card status line, should name `getGameGridStates`.
- [ ] Specs 0027, 0028 and 0029 carry G8 follow-ups that this spec closes; tick them when it ships.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
