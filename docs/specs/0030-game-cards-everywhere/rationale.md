# 0030. Game cards everywhere: rationale

## Context

Since G5 to G7, games appear on four kinds of grid: the `/games` landing sections, the five `/games/{slug}` list pages, `/search?type=game` and the three library tabs. Only the library tabs know anything about the user. Everywhere else a game card is a cover, a name and IGDB's rating, while a movie card next door shows your score, a Plan bookmark and a release pill. Specs 0027, 0028 and 0029 each left a G8 follow up saying so.

The forces: `cacheComponents` is on, so the personal parts must stream in their own Suspense boundaries and never enter a shell or a `use cache` scope. A grid holds up to 24 cards, so a read per card would be 24 queries. The games rules say statuses are set by hand, any to any in one click, and that a score clears on a move back to Want to play; a card has room for one 40px control at most. The release gate allows Want to play before release but nothing else. And a card's status must match its library page.

Not deciding leaves games half finished next to movies, and leaves three specs with open follow ups.

## Options considered

### Option 1: Mirror the movie card slots for games

A cached grid read, a pure status function, a server badge slot, a server controls slot and one client bookmark, the same pieces `movie-card-slots.tsx` uses.

**Pros**:
- Proven shape: the movie version already passes the shell, Suspense and one read per grid rules.
- Small: no new actions, no schema, one client component.

**Cons**:
- The card cannot change a started game's status; that stays on the game page.

### Option 2: A status chip that opens a menu of all three statuses

The chip opens a popover with Want to play, Playing, Finished and Remove, reusing `applyGameIntent`.

**Pros**:
- Matches the games rule of any status to any other in one click, on every surface.

**Cons**:
- A popover per card, with the release gate, the score clearing Undo and focus return to handle inside a 180px card; much more client code on every grid.
- Moving a game back to Want to play from a card would clear a score with very little context.

### Option 3: Reuse the full `GameStatusControl` on the card

**Pros**:
- No new control at all.

**Cons**:
- Three pills and a score pill do not fit a poster card at any width; it would redesign the card.

## Rationale

The engineer chose the bookmark only control in the design conversation, and it fits the forces best. The only move a card can make is between nothing and Want to play, and both are always allowed (before release too), so the card needs no gate logic and can never clear a score by accident. The started states still show, as a read only chip and the personal score, so the card tells the truth about where a game sits, which is what "a card's status always matches its library page" needs. Option 2 would satisfy the "one click" rule on cards too, but the game page and the library tabs already offer that, and the cost (a popover with Undo and gating per card) is high for a browsing surface.

Reusing `PlanIcon` and `PlannedIcon` keeps the green token's single meaning: Want to play is the games version of Planned. The badge follows the games library card (score on Playing and Finished) rather than the movie card (score only on Watched), because Playing is where many scored games sit and the movie rule would hide those scores. The year meta line was the engineer's pick, giving the landing and list pages the line `/search` already had. The wide cards and top rated rows keep their own layouts, since they are not `PosterCard` grids.

The flag question was settled by consistency: the game page's status control is not gated by `NEXT_PUBLIC_GAMES_LIBRARY`, so gating the card would make the same write available on one surface and not the other.

### Decisions made while writing (recommend items)

- **Read placement**: `getGameGridStates` sits in `lib/tracking/game-state.ts` next to `getGameTracking`, keyed by `gameIdsKey` the way `movieIdsKey` keys the movie read. Runner up: a generic grid read for all media types, which would couple three tables for no gain.
- **Pure status in `lib/catalog/game-page.ts`**: beside `isGameReleased`, so the release day rule has one home. Runner up: inline in the slot, which would be untestable without a session.
- **Bookmark add path**: `setGameStatus(id, "want_to_play")` rather than a new action. From no row it returns no Undo, so the add shows no toast. Over a stale card (another tab started and scored the game) it clears the score and returns the score cleared Undo, which the bookmark shows, so nothing is lost silently (found by the cross check). Runner up: a dedicated `addGame` that only inserts and refuses an existing row, which would avoid the demotion but duplicate the RPC and add an error state.
- **Disabled while pending**: unlike the movie bookmark, the game bookmark sends two different actions for its two directions, so two writes in flight could land in either order; disabling it for the short write is the simplest guard. Runner up: a target value queue, which is more code for a rare double tap.
- **Library status from the item**: `LibraryGameItem.status` rather than a tab prop on the grid, so each card is self describing and hidden games need no special case.
- **Library Want to play button**: same glyph and accessible name pattern as the movie Watchlist card, reusing `GameLibraryGrid`'s existing removal, so no new client state.
