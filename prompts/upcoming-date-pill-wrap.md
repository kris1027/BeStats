# Date pills always show the full year

## Goal

On an Upcoming or Coming soon card, a date outside the current year is cut to `Feb 23, 2…` when the pill shares the bottom row with the card's button. The date must always show in full. When the row has no room, the button moves to a line of its own above the pill, not the date.

## Inspected

- `components/library/dated-pill.tsx`: no `truncate`, `shrink-0`, the glyph rule kept only behind `phoneGlyphless`, and the JSDoc updated.
- `components/poster-card.tsx:146`: the controls row, `absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2`, shared by every poster card.
- Every pill user: `library-card.tsx` (movie Upcoming), `game-library-card.tsx` (games Coming soon), `tracking/movie-card-slots.tsx` and `tracking/game-card-slots.tsx` (catalog Upcoming), `catalog/list-cards.tsx`, `library/show-cards.tsx` (show Upcoming, pill alone in the row), `app/showcase/page.tsx` and `app/showcase/game-card-demo.tsx`.
- Every button beside a pill carries `ml-auto` (`card-bookmark-button`, `game-card-bookmark-button`, `game-status-chip`, the library remove buttons), so a button alone on a line already sits right.
- No test references the pill's classes.

## Skills used

`grilling` (decisions below). No Supabase or catalog work.

## Decisions (owner, 2026-11-05)

1. **Never cut the date.** The pill text loses `truncate`, and the pill stays at its natural width (`shrink-0`).
2. **The bookmark lives top right, the badge top left, on every poster card (owner, 2026-11-05, revised twice after building).** The Plan and Planned bookmark (catalog, search and library cards, movies, shows and games, and the missing show card) sits in the poster's top right corner at every width. The rating badge sits top left on every poster card, so it never jumps when the signed in controls stream in. Other controls (the Watched eye, the X, Mark next watched, the Playing and Finished chip) stay in the bottom row. A date pill is therefore always alone at the bottom. The first build wrapped the button above the pill, and the second moved it only on date cards; the owner replaced both.
3. **Calendar glyph at every width.** The `ENDS_IN_YEAR` rule that hid it below `sm` (spec 0020) is removed.
4. **One rule for every date pill**: library movie Upcoming, games Coming soon, catalog Upcoming movies and games, show Upcoming cards and `/showcase`.
5. **Marked by the button, not the card.** `CardRoundButton` takes `top`, which renders `data-card-top`. `PosterCard` keys on it: a row holding one spans the poster (`top-2.5`, wrapping lines packed at the bottom, still pointer-events-none) and places that child top right. No card needs a new prop, which matters because the catalog slots render the bookmark inside Suspense.
6. **The show pill drops its glyph on phones (owner, 2026-11-05, after measuring).** A show Upcoming pill stands alone in its row, so there is nothing to move, and at 375px `S2E5 · Feb 23, 2027` is 148px and `S12E10 · Feb 23, 2027` is 158px against a 144px row. Only that pill (`phoneGlyphless`) keeps the old rule: below `sm`, a date with a year hides the calendar glyph, which brings the longest pill to 134px. Movie and game pills keep the glyph everywhere.

## Expected files

- `components/library/dated-pill.tsx`: no `truncate`, `shrink-0`, the glyph rule kept only behind `phoneGlyphless`, and the JSDoc updated.
- `components/library/show-cards.tsx`: `phoneGlyphless` on the show pill (decision 6).
- `components/poster-card.tsx`: the badge slot top left; `CONTROLS_ROW` and `TOP_CONTROL_ROW`.
- `components/tracking/card-round-button.tsx`: the `top` prop.
- `top` on the bookmarks: `tracking/card-bookmark-button.tsx`, `tracking/game-card-bookmark-button.tsx`, `tracking/show-card-bookmark-button.tsx`, `library/library-card.tsx` (Watchlist and Upcoming), `library/game-library-card.tsx` (Want to play and Coming soon), `library/missing-show-card.tsx`, and the `/showcase` demos.

## Acceptance criteria

- AC-1: At 375×812, 768×1024 and 1440×900, every card with a pill shows the full date, `Feb 23, 2027` style, with no ellipsis.
- AC-2: On every poster card with a Plan or Planned bookmark, the bookmark sits top right (its circle at the badge's 10px inset) at every width, and a date pill is alone at the bottom.
- AC-3: The rating badge sits top left on every poster card, with or without a bookmark, signed in or out.
- AC-3b: The Watched eye, the X, Mark next watched and the status chip stay bottom right; the bookmark keeps its 44px touch target below `md`.
- AC-4: The calendar glyph shows at every width, except a show pill with a year below `sm` (decision 6).
- AC-5: Cards with neither a bookmark nor a date (Watched, Playing, Finished) change only in their badge, now top left.
- AC-6: The pill's accessible text (the full date) is unchanged.

## Security and privacy

None involved: presentational only.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (`design-tokens-boundary` included).

## Manual test steps

1. `pnpm dev:docker`, sign in, and add a game and a movie released next year to Want to play and the Watchlist.
2. Open the games Coming soon tab and the movie Upcoming tab at 375×812: the full date with its year shows alone bottom left, the bookmark top right, and the IGDB rating top left.
3. Widen to 640, 768, 1024 and 1440px: the same layout, and the date is never cut.
4. Open `/movies`, `/shows`, `/games`, `/search`, `/movies/upcoming` and `/games/coming-soon` signed in: every bookmark is top right and every badge top left. Signed out: badges top left, no bookmark.
5. Open the shows Upcoming tab at 375×812: the full `S2E5 · Feb 23, 2027` shows with no calendar glyph; from 640px the glyph is back.
6. Open Watched, Playing and Finished: the Watched eye, the X and the status chip stay bottom right, the badge top left.
7. Tab through a card: the focus ring on the top right bookmark is visible and the pill isn't focusable.
