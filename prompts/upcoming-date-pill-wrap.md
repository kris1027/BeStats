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
2. **The button moves to the top right, the badge to the top left (owner, 2026-11-05, revised after the first build).** On every card with a date pill, at every width, the pill has the bottom row to itself. The card's button (bookmark or remove) takes the top right corner and the rating badge moves to the top left. The first build wrapped the button above the pill instead; the owner replaced that.
3. **Calendar glyph at every width.** The `ENDS_IN_YEAR` rule that hid it below `sm` (spec 0020) is removed.
4. **One rule for every date pill**: library movie Upcoming, games Coming soon, catalog Upcoming movies and games, show Upcoming cards and `/showcase`.
5. **Only date cards change.** The pill carries `data-dated-pill`. `PosterCard` keys on it with `has-[...]`: the controls row spans the poster (`top-2.5`, `items-end`, still pointer-events-none), every child but the pill is placed top right, and the badge slot moves left through `group-has-[...]`. Every other poster card is unchanged, and no card needs a new prop, which matters because the catalog slots render the pill conditionally inside Suspense.

6. **The show pill drops its glyph on phones (owner, 2026-11-05, after measuring).** A show Upcoming pill stands alone in its row, so there is nothing to move, and at 375px `S2E5 · Feb 23, 2027` is 148px and `S12E10 · Feb 23, 2027` is 158px against a 144px row. Only that pill (`phoneGlyphless`) keeps the old rule: below `sm`, a date with a year hides the calendar glyph, which brings the longest pill to 134px. Movie and game pills keep the glyph everywhere.

## Expected files

- `components/library/dated-pill.tsx`: no `truncate`, `shrink-0`, `data-dated-pill`, the glyph rule and `ENDS_IN_YEAR` removed, and the JSDoc updated.
- `components/library/show-cards.tsx`: `phoneGlyphless` on the show pill (decision 6).
- `components/poster-card.tsx`: `CONTROLS_ROW` and `DATED_CONTROLS_ROW`, and the badge slot's left position on date cards.
- `app/showcase/page.tsx`: a pill sample with a next year date beside a button at the narrow card width, if none is shown already.

## Acceptance criteria

- AC-1: At 375×812, 768×1024 and 1440×900, every card with a pill shows the full date, `Feb 23, 2027` style, with no ellipsis.
- AC-2: On a card with a date pill, the pill sits bottom left, the button top right (its circle at the badge's 10px inset) and the rating badge top left, at every width.
- AC-3: The button keeps its 44px touch target below `md`.
- AC-4: The calendar glyph shows at every width, except a show pill with a year below `sm` (decision 6).
- AC-5: Cards without a date pill (Watchlist, Watched, Playing, Finished, catalog cards of released titles) are pixel identical.
- AC-6: The pill's accessible text (the full date) is unchanged.

## Security and privacy

None involved: presentational only.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (`design-tokens-boundary` included).

## Manual test steps

1. `pnpm dev:docker`, sign in, and add a game and a movie released next year to Want to play and the Watchlist.
2. Open the games Coming soon tab and the movie Upcoming tab at 375×812: the full date with its year shows bottom left, the bookmark top right, and the IGDB rating top left.
3. Widen to 640, 768, 1024 and 1440px: the same layout, and the date is never cut.
4. Open `/movies/upcoming` and the games Upcoming page at the same widths, signed in and signed out.
5. Open the shows Upcoming tab at 375×812: the full `S2E5 · Feb 23, 2027` shows with no calendar glyph; from 640px the glyph is back.
6. Check that Watchlist, Watched, Playing and Finished cards look as before.
7. Tab through a date card: the focus ring on the button is visible and the pill isn't focusable.
