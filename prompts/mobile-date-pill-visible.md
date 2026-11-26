# Plan: the date on the app's date pills is always visible

## Goal

On the app's Upcoming shows page the pill `S2E5 · Nov 27` is cut to `S2E5 · No...`, so the date, the one thing the page is about, is lost. Every date pill must show its whole date.

## Inspected code

- `apps/mobile/src/lib/library-card.ts`: `libraryCardView` draws core's `upcomingEpisodePill` text (`S2E5 · Nov 27`) as the pill; `cardPill` maps core's pill words for library and catalog cards.
- `apps/mobile/src/components/library-card.tsx`: the pill sits at the poster's foot, at most `width - 20` wide; the card's label is built from the name, pill label, episode name, badge and `meta`.
- `apps/mobile/src/components/glass-pill.tsx`: one line, 13pt bold, `px-2.5`, `PILL_FONT_SCALE_CAP` 1.4.
- `apps/mobile/src/components/poster-card.tsx` and `lib/catalog-card-actions.ts`: the catalog card's bottom pill is a release date (`dateLabel` or a mark) or a game status.
- `apps/mobile/src/components/grid-layout.ts`: three columns, so a card is 115pt on a 402pt phone. That leaves about 75pt for pill text (estimated, not measured); `S2E5 · Nov 27` needs about 92pt.
- `packages/core/src/catalog/library-card.ts`, `format.ts`, `tracking/messages.ts`: `upcomingEpisodePill` (shared with the web), `formatReleaseDate`, `NEXT_EPISODE_MESSAGES.pill`.
- `apps/mobile/src/__tests__/library-screen.test.tsx`: pins the Upcoming pill as `S3E1 · Dec 3`.

## Skills

`mattpocock-skills:grill-me` (decisions below). Read the Expo SDK 58 / React Native `Text` docs for `adjustsFontSizeToFit` before writing code.

## Decisions (agreed 2026-11-26)

1. An Upcoming show card's pill prints only the date (`Nov 27`, or with the year in another year), or `Date TBA`.
2. `S2E5` moves to the small grey line under the title (`meta`). No known episode means no line. A TBA card with a known episode keeps the line.
3. Every date pill (library Upcoming and Coming soon, catalog release pills) keeps the year, takes tighter side padding (`px-2`) and shrinks its text only when it does not fit. Amended after the simulator check, agreed 2026-11-26: there is no minimum scale. The first build set `minimumFontScale` 0.8, which iOS ignores (React Native 0.88.1 reads only `minimumFontSize`, which JavaScript cannot set), and which at large text would cut a date where it applies. Other pills (ratings, Up next, game status) are unchanged.
4. App only. The web stays as it is, and core's `upcomingEpisodePill` keeps its words (it gained the bare `date` field after review).
5. If the longest date is still cut or too small to read in the simulator, stop and ask before choosing another layout.

## Expected files

- `apps/mobile/src/lib/library-card.ts`: for Upcoming shows, keep core's `label` (the full sentence) and take the printed text from core's `date` when core says `dated`; set a new `episodeLine` from `NEXT_EPISODE_MESSAGES.pill`, with `meta` null. Every `CardPill` says `isDate`.
- `apps/mobile/src/lib/catalog-card-actions.ts`: only if a type needs it; release pills already go through `cardPill`.
- `apps/mobile/src/components/glass-pill.tsx`: a `fitDate` option (padding, `adjustsFontSizeToFit`, shrinkable text).
- `apps/mobile/src/components/library-card.tsx`: pass `fitDate`; draw `episodeLine` under the name and leave it out of the spoken label, since the pill's label already names the episode.
- `apps/mobile/src/components/poster-card.tsx`: pass `fitDate` for `dateLabel` and date marks, not for a game status.
- `packages/core/src/catalog/library-card.ts`: `upcomingEpisodePill` also returns the bare `date` (added after review, so the app never formats it again; its text and label, and so the web, are unchanged).
- Tests: `library-screen.test.tsx`, `components/glass-pill.test.tsx`, `lib/catalog-card-actions.test.ts`, core's `library-card.test.ts`.
- `apps/mobile/AGENTS.md`: one sentence on date pills.

## Requirements

- Dates stay UTC days, from core's formatters (root AGENTS.md section 9). No invented or reworded date.
- Screen readers hear what they heard before, with the episode named once.
- Loading, missing image, failed and missing cards are unchanged. Card actions and menus are unchanged.
- No new dependency, route, API or database change.

## Security

None: display only, no new data, input or request.

## Acceptance criteria

- Upcoming show with a date: pill `Nov 27`, line `S2E5` under the title.
- Date TBA with a known episode: pill `Date TBA`, line `S2E5`; with none, no line.
- A date in another year (`Feb 23, 2027`) shows whole on a library card and a catalog card, at default and large system text.
- Short dates draw at full size.

`adjustsFontSizeToFit` can behave badly in a pill that sizes to its text, and Jest does not lay text out, so the fit is proven only in the simulator. A catalog card never has both a date pill and a Watched mark: a movie's pill is for Upcoming and its mark for Watched, only games' lists date their cards, and a game has no Watched mark.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`. `pnpm build` and `pnpm test:db` are not needed.

## Manual test

1. Run the app in the iOS Simulator (an iPhone about 402pt wide) against the local stack, signed in.
2. Track a show whose next episode has an air date. Library, Shows, Upcoming: the pill shows the date, `SxEy` sits under the title.
3. Find a show or planned movie dated next year (Library Coming soon, and the catalog's upcoming movie list): the whole date with its year is readable.
4. Set the largest standard text size, then an accessibility size, and repeat steps 2 and 3. No `...` anywhere.
5. Repeat step 3 on the narrowest available simulator.
6. With VoiceOver labels (Accessibility Inspector), an Upcoming card reads its full air sentence and the episode once.
7. Check Up next, game status and rating pills look as before.

Work goes on `feat/mobile-date-pill-visible` off `main`.

## Simulator results (2026-11-26)

iPhone 17e simulator (390pt, the narrowest installed). A temporary screen, not committed, drew the real `LibraryCard` and `PosterCard` with sample dates at card widths of 106pt (a 375pt phone), 111pt and 115pt, with `onTextLayout` logging the drawn size. Text sizes: `large` (default), `extra-extra-extra-large` and `accessibility-extra-large`.

- Every date on a real card layout showed whole, with no `...`, at all three sizes.
- `Nov 27` drew at full size, growing with the text setting.
- Smallest next year date: `May 28, 2027` on the 106pt card, about 83% of the default 13pt (about 10.8pt) at all three sizes. At the largest standard size that is about 61% of the requested size, so a working 80% floor would have cut it.
- `May 28, 2027` on a catalog card: about 88% of the default at 111pt.

These measurements were first taken with the 0.8 floor still set. Rechecked on the final code (no floor) at `large` and `extra-extra-extra-large` for the 106pt and 115pt cards: `May 28, 2027` drew at the same sizes.

On real local data, signed in, at the default size: the Upcoming shows card read `Nov 29` whole with `S2E5` under the name (step 2), and the Up next pill kept its icon and `S3E2` (part of step 7). The pages were opened by a temporary redirect, not committed.

Not run: step 3 on a real next year title (the account's Coming soon movies page was empty), step 6 (VoiceOver; Jest covers the label's parts only), game status and rating pills on a real Library page, and Android.
