# Date pills always show the full year

## Goal

On an Upcoming or Coming soon card, a date outside the current year is cut to `Feb 23, 2…` when the pill shares the bottom row with the card's button. The date must always show in full. When the row has no room, the button moves to a line of its own above the pill, not the date.

## Inspected

- `components/library/dated-pill.tsx`: `DatedPill`, `DateTbaPill` and `ReleasePill`. The text span is `truncate` and the pill `min-w-0`, so the pill shrinks and cuts the date. Below `sm`, a date ending in a year hides the calendar glyph (`ENDS_IN_YEAR`, `max-sm:[&>span:first-child]:hidden`).
- `components/poster-card.tsx:146`: the controls row, `absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2`, shared by every poster card.
- Every pill user: `library-card.tsx` (movie Upcoming), `game-library-card.tsx` (games Coming soon), `tracking/movie-card-slots.tsx` and `tracking/game-card-slots.tsx` (catalog Upcoming), `catalog/list-cards.tsx`, `library/show-cards.tsx` (show Upcoming, pill alone in the row), `app/showcase/page.tsx` and `app/showcase/game-card-demo.tsx`.
- Every button beside a pill carries `ml-auto` (`card-bookmark-button`, `game-card-bookmark-button`, `game-status-chip`, the library remove buttons), so a button alone on a line already sits right.
- No test references the pill's classes.

## Skills used

`grilling` (decisions below). No Supabase or catalog work.

## Decisions (owner, 2026-11-05)

1. **Never cut the date.** The pill text loses `truncate`, and the pill stays at its natural width (`shrink-0`).
2. **The button moves.** When the pill and the button don't fit on one line, the button wraps onto a line above the pill and stays right-aligned. The pill stays bottom-left. The wrap is decided by the actual width, not a breakpoint: `flex-wrap-reverse` puts the wrapped line above.
3. **Calendar glyph at every width.** The `ENDS_IN_YEAR` rule that hid it below `sm` (spec 0020) is removed.
4. **One rule for every date pill**: library movie Upcoming, games Coming soon, catalog Upcoming movies and games, show Upcoming cards and `/showcase`.
5. **Only date cards wrap.** The controls row gets `has-[[data-dated-pill]]:flex-wrap-reverse` (plus a row gap), and the pill carries `data-dated-pill`. Every other poster card's row is unchanged, and no card needs a new prop, which matters because the catalog slots render the pill conditionally inside Suspense.

6. **The show pill drops its glyph on phones (owner, 2026-11-05, after measuring).** A show Upcoming pill stands alone in its row, so there is nothing to move, and at 375px `S2E5 · Feb 23, 2027` is 148px and `S12E10 · Feb 23, 2027` is 158px against a 144px row. Only that pill (`phoneGlyphless`) keeps the old rule: below `sm`, a date with a year hides the calendar glyph, which brings the longest pill to 134px. Movie and game pills keep the glyph everywhere.

## Expected files

- `components/library/dated-pill.tsx`: no `truncate`, `shrink-0`, `data-dated-pill`, the glyph rule and `ENDS_IN_YEAR` removed, and the JSDoc updated.
- `components/library/show-cards.tsx`: `phoneGlyphless` on the show pill (decision 6).
- `components/poster-card.tsx`: the `has-[[data-dated-pill]]` wrap on the controls row, with a JSDoc line.
- `app/showcase/page.tsx`: a pill sample with a next year date beside a button at the narrow card width, if none is shown already.

## Acceptance criteria

- AC-1: At 375×812, 768×1024 and 1440×900, every card with a pill shows the full date, `Feb 23, 2027` style, with no ellipsis.
- AC-2: Where the date and the button fit on one line, the layout is unchanged: pill left, button right.
- AC-3: Where they don't fit, the button sits on a line above the pill, right-aligned, and both stay inside the poster with 44px touch targets.
- AC-4: The calendar glyph shows at every width, except a show pill with a year below `sm` (decision 6).
- AC-5: Cards without a date pill (Watchlist, Watched, Playing, Finished, catalog cards of released titles) are pixel identical.
- AC-6: The pill's accessible text (the full date) is unchanged.

## Security and privacy

None involved: presentational only.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (`design-tokens-boundary` included).

## Manual test steps

1. `pnpm dev:docker`, sign in, and add a game and a movie released next year to Want to play and the Watchlist.
2. Open the games Coming soon tab and the movie Upcoming tab at 375×812: the full date with its year shows, and the bookmark sits above the pill when it doesn't fit beside it.
3. Widen to 640, 768, 1024 and 1440px: once there is room, the bookmark returns beside the pill, and the date is never cut.
4. Open `/movies/upcoming` and the games Upcoming page at the same widths, signed in and signed out.
5. Open the shows Upcoming tab at 375×812: the full `S2E5 · Feb 23, 2027` shows with no calendar glyph; from 640px the glyph is back.
6. Check that Watchlist, Watched, Playing and Finished cards look as before.
7. Tab through a wrapped card: the focus ring on the button is visible and the pill isn't focusable.
