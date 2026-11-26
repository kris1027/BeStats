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
3. Every date pill (library Upcoming and Coming soon, catalog release pills) keeps the year, takes tighter side padding (`px-2`) and shrinks its text only when it does not fit, never below 80% (`minimumFontScale` 0.8, an assumption). Other pills (ratings, Up next, game status) are unchanged.
4. App only. Core's `upcomingEpisodePill` and the web stay as they are.
5. If the longest date is still cut or too small to read in the simulator, stop and ask before choosing another layout.

## Expected files

- `apps/mobile/src/lib/library-card.ts`: for Upcoming shows, keep core's `label` (the full sentence) and take the printed text from `formatReleaseDate(airDate, today).shortDate` when core says `dated`; set `meta` from `NEXT_EPISODE_MESSAGES.pill`. `CardPill` gains a `date` flag, set by `cardPill`.
- `apps/mobile/src/lib/catalog-card-actions.ts`: only if a type needs it; release pills already go through `cardPill`.
- `apps/mobile/src/components/glass-pill.tsx`: a `fitDate` option (padding, `adjustsFontSizeToFit`, `minimumFontScale`, shrinkable text).
- `apps/mobile/src/components/library-card.tsx`: pass `fitDate`; leave the Upcoming `meta` out of the spoken label, since the pill's label already names the episode.
- `apps/mobile/src/components/poster-card.tsx`: pass `fitDate` for `dateLabel` and date marks, not for a game status.
- Tests: `library-screen.test.tsx`, `components/glass-pill.test.tsx`.
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

`adjustsFontSizeToFit` can behave badly in a pill that sizes to its text, and Jest does not lay text out, so the fit is proven only in the simulator. A catalog card with both a release pill and a Watched mark has the least room; the release gate makes that pair unlikely.

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
