# Landing review fixes

Asked by the user on 2026-10-18 after a two axis review of `feat/home-parallax-landing` against `main`: "fix all one by one, commit and then push it". The request is the approval; each fix is its own commit.

## Goal

Close every finding of that review without changing what the landing shows, except where a finding is a visible bug (two Try again panels, a date shown twice).

## Inspected code

`components/catalog/landing/*`, `components/layout/page-background-motion.tsx`, `components/tracking/movie-card-slots.tsx`, `lib/catalog/media-type.ts`, `app/showcase/page.tsx`, `app/layout.test.ts`, `app/layout-purity.test.ts`, `components/AGENTS.md`.

## Decisions

1. **URLs.** `landingItems` builds `href` with `titleHref`, and `LandingControls` takes its return path from `CATALOG_PATHS`, the documented single builders (`lib/catalog/media-type.ts`).
2. **One Try again when trending fails.** The hero renders nothing when the trending read fails; the pinned Trending row right below it carries the section's heading and its one error state. This is what decision 4 of prompts/home-parallax-landing.md asks for ("the plain heading with the section's error state"); the hero no longer repeats it.
3. **Date shown once on a wide card.** The wide card already prints a movie's release date for everyone, so its controls leave out `MovieCardControls`' release pill (a new `releasePill` prop, true by default). Poster cards keep the pill, so AC-3 of prompts/landing-card-controls.md still holds where the date is not already on the card.
4. **Empty control plate.** The wide card's top left plate takes `empty:hidden`, so a visitor's card draws no zero size plate.
5. **One section read.** `readLandingSection(list, count)` owns the read, error, empty and ids steps every section repeated; each section's `*Items` keeps its own markup.
6. **One missing artwork tile.** `ArtFallback` (with `data-slot="poster-fallback"`, as the other fallbacks) replaces the three copies in the hero, wide card and top rated row.
7. **One media type branch for the slots.** A `LANDING_SLOTS` map in `landing-badge.tsx` holds each media type's badge, controls and hero tracking control, and the hero reads its genre list from a per type map. `landingItems` and the Upcoming date label keep their branch: they map different TMDB fields, not different components.
8. **One motion loop.** `startMotionLoop` in `lib/motion/loop.ts` owns the reduced motion check, the eased mouse lean, the frame loop, the reset and the listeners; `LandingParallax` and `PageBackgroundMotion` pass only their tick and reset.
9. **JSDoc** on every exported section body and on `landingItems` / `itemIds`, saying why.
10. **Showcase.** The Landing sections block adds the hero and Now skeletons, a failed and an empty section, and the missing artwork tile in a wide card and a hero box.
11. **Stale references.** The layout tests cite prompts/warm-page-background.md, and `components/AGENTS.md` names `LandingParallax` as the landing's one client island outside the shell.

## Acceptance criteria

- AC-1: A failed trending read shows exactly one "Couldn't load Trending this week" on `/movies` and `/shows`.
- AC-2: A signed in user's Upcoming row shows a planned movie's date once.
- AC-3: Every landing card still links to `/movies/{id}` or `/shows/{id}`, and the controls' session toast returns to the landing.
- AC-4: `/showcase` shows every landing loading shape, a failed and an empty section, and the missing artwork tile.
- AC-5: The motion is unchanged: the existing parallax and background motion tests pass.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev`, open `/showcase`: the Landing sections block shows all six skeletons, the error and empty lines, and two missing artwork tiles.
2. Open `/movies` with the TMDB token unset or wrong: one Trending error with Try again, not two.
3. Signed in, plan an upcoming movie, open `/movies`: its Upcoming card shows the date once, at the bottom.
4. Scroll `/movies` with a mouse and with reduced motion on: the parallax and the background behave as before.
