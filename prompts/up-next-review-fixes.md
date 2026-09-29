# Up Next review fixes

## Goal

Act on the code review of `feat/up-next` (spec 0014) before it merges: stop the Coming soon read from holding up Up Next, give a show with nothing aired an empty state, and tidy two small duplications.

## Inspected

- `components/upcoming/upcoming-sections.tsx`, `up-next-pill.tsx`, `up-next-card.tsx`, `mark-next-watched-button.tsx`, `coming-soon-grid.tsx`, `ids.ts`
- `lib/tracking/messages.ts`, `lib/tv/up-next.ts`, `app/upcoming/page.tsx`, `app/upcoming/request-scope.test.ts`
- `docs/specs/0014-up-next/index.md` (AC-5, AC-14, AC-16) and `verify.md` (cold timing: first card 8.4 s)

## Decisions

1. **Up Next streams first.** `UpcomingSections` starts both reads, awaits only Up Next, and hands the running Coming soon promise to a Suspense boundary inside the Coming soon section (heading renders at once, grid skeleton as fallback). Only when Up Next is empty does it await Coming soon up front, because the both empty panel (AC-13) needs both results. Failures stay independent (AC-14).
2. **Nothing aired caption.** A `not_aired` show with no dated upcoming episode gets the caption "No episodes aired yet" under its name, still no pill (`AGENTS.md` section 9, "a sensible empty state").
3. **One `/upcoming` constant.** `UPCOMING_PATH` moves to `components/upcoming/ids.ts`; the four local copies go.
4. **Toast id.** `MarkNextWatchedButton` builds its toast id with `upNextCardLinkId`.
5. **Spec text.** AC-5 gains the caption line, AC-14 describes the streamed Coming soon read, AC-16 says `PosterCard` gains only the `linkId` prop.

Out of scope: shared Undo helper, `UNDO_TOAST_MS` / `EAGER_POSTERS` consolidation, focus after a failed removal (all match existing library pages).

## Security

No change to reads, writes or caching. Every read stays behind `requireUser()` and outside any `use cache` scope; `request-scope.test.ts` still guards it.

## Acceptance criteria

- With Watching shows, Up Next cards render without waiting for the Coming soon movie batch.
- With no Watching shows and no upcoming planned movies, the single "Nothing upcoming yet" panel still shows.
- A failed Coming soon read shows its section error while Up Next renders, and vice versa.
- A Watching show with no aired and no dated episode shows "No episodes aired yet".

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test

1. `pnpm dev:docker`, sign in as a user with Watching shows and planned movies, open `/upcoming`: Up Next cards appear while the Coming soon grid still shows its skeleton on a cold load.
2. Sign in as a user with nothing tracked: the "Nothing upcoming yet" panel shows, not two empty sections.
3. Track a show that has not aired (Watching): its card reads "No episodes aired yet".
