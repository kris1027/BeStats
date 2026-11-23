# Mobile look, slice 2: title pages

## Goal

Give the app's movie, show, season and game screens the web's visual language with a native layout (feature 29, slice 2 in [docs/scope/scope.md](../docs/scope/scope.md)). The foundation (slice 1, PR #99, merged) already gave every screen the background, glass, Inter, icons and pills. This slice changes the title screens' layout and fills the gaps the web has and the app lacks: a stretchy backdrop that hands over to the native header, the actions within thumb reach, genre and status pills, vote counts, crew lines, the Facts panel, the show cast row, a richer season and episode layout, swipe to toggle watched on episode rows, and the "Clear rating" copy shared through core.

Governing decisions: [prompts/mobile-web-parity-foundation.md](mobile-web-parity-foundation.md) (decisions 1 to 14, Roadmap item 1). The web is not changed, apart from reading "Clear rating" from core.

## Progress (2026-11-23)

On `feat/mobile-look-title-pages`, everything is built, tested and committed; not pushed. Every automated check passes. Left: the simulator pass (Manual test steps) and one open point: the swipe's action is hidden from VoiceOver, which reaches the same action through the row's Watched button (requirement 7 asked for a custom action on the row).

## Inspected

- **Screens** (`apps/mobile/src/screens/`): `movie-screen.tsx`, `show-screen.tsx`, `season-screen.tsx`, `game-screen.tsx`. Each is a `ScrollView` that sets `Stack.Screen options={{ title }}` once loaded. Movie, show and game open with `DetailHeader` (a 16:9 backdrop, then poster, title, a ` · ` meta line and the community badge), then `TrackingGate` with the actions, then text sections. The season screen has no artwork header at all, and its episode rows put the Watched button and score pill under each row.
- **Components**: `detail-header.tsx` (`DetailHeader`, `DetailSection`), `episode-row.tsx`, `season-nav.tsx`, `score-sheet.tsx` (its clear button reads "Clear score"), `cast-row.tsx` (movie only), `rating-line.tsx`.
- **Navigation**: `src/theme/stack-options.tsx` gives every stack an opaque header in the flattened page colour (`tokenColorOver`), no transparent header, no large title. Reanimated 4.7 is used only by the launch overlay; `react-native-gesture-handler` 3.3 is installed but imported nowhere, and there is no `GestureHandlerRootView`.
- **API**: `GET /api/v1/movies/{id}` and `/shows/{id}` (`apps/web/app/api/v1/`) map from `loadMovie` and `loadShow` but leave out fields the web's title pages show: `originalLanguage`, `budget`, `revenue`, `productionCompanies`, `writers` (movie); `originalLanguage`, `type`, `networks`, `productionCompanies` (show). The show cast is a separate cached read on the web (`getShowCast`, its own Suspense boundary with its own error line).
- **Web reference**: `components/catalog/title-details.tsx` (crew lines and `FactsPanel`, each fact only when it has a value), `detail-hero-meta.tsx` (`GenreChips` as `GlassPill`s), `show/episode-row.tsx` (16:9 still with rim, `S1 · E3` kicker, bold title, meta line, TMDB pill, clamped overview). Formatters already in core: `formatVoteCount`, `languageName`, `formatUsdCompact`, `formatAirDate`.
- **Tests**: `src/__tests__/movie-screen.test.tsx`, `show-tracking.test.tsx` (show and season), `game-tracking.test.tsx`, `title-screens.test.tsx`, through `src/test-utils/title-harness.tsx`; the v1 contracts in `packages/core/src/api/v1/*.test.ts` and each route's test.

## Skills used

`expo-router` (transparent headers, `headerBackground`), `expo-animation` (scroll driven header, the swipe and its haptic), `vercel-react-native-skills` and `react-native-best-practices` (scroll handlers on the UI thread, list cost), `react-native-testing` (RNTL v14). Before the code, the SDK 58 docs for Expo Router stack options and the Reanimated 4 and Gesture Handler 3 swipe APIs (`ReanimatedSwipeable`), as `apps/mobile/AGENTS.md` asks.

## Decisions and assumptions

1. **Age rating pill moves to slice 3** (your call today). It comes from TMDB's extras read with a per country pick, which slice 3 brings to `/api/v1` together with Where to watch, so both share one region rule. The scope line for slice 2 is updated to say so.
2. **The missing fields are added to the existing reads, not new routes.** `v1MovieSchema` gains `originalLanguage`, `budget`, `revenue`, `productionCompanies` (`{ id, name, logoUrl }`) and `writers`; `v1ShowSchema` gains `originalLanguage`, `type`, `networks`, `productionCompanies` and `cast`. All come from the same normalized `Movie` and `TvShow` the web pages read; nothing is invented. The change is additive: an older app build parses with its own schema, which drops the unknown keys, so no app version gate is needed.
3. **The show cast rides on the show read, and a failed cast read never fails the show.** The route reads `loadShow` and `getShowCast` in parallel; when only the cast fails, `cast` is `null` and the screen shows the web's cast error line under the Cast heading. Not found or a failed show read answers as today. The cached cast read lives a day, so the `s-maxage=60` show answer costs no extra TMDB calls.
4. **Stretchy backdrop, native header.** Movie, show and game get `headerTransparent: true` with a `headerBackground` that fades from clear to the existing flattened page colour as the backdrop scrolls under it, and the title fades in at the same point. Pulling down past the top stretches the backdrop (a scale from its bottom edge). There is no parallax: the backdrop moves 1:1 with the content. Under Reduce Motion the stretch is off and the header fade becomes a switch at the same point. The scroll handler runs on the UI thread (`useAnimatedScrollHandler`), so no React render per frame. A screen with no backdrop starts with the solid header, as now.
5. **Thumb reach.** The hero is the backdrop with the poster overlapping its lower edge and the title, pills and community rating beside or under it, kept short so the tracking actions (Plan, Mark watched, score; Track; the game statuses) sit in the lower half of the first screen on a 375 by 812 phone. The actions stay in the scroll content (no floating bar), full width glass buttons at 44pt.
6. **Hero pills and vote counts.** Genres as `GlassPill`s (labels, not controls, as on the web), status as a `GlassPill` (TMDB's word as is), and the community badge followed by its vote count (`formatVoteCount`; a game shows IGDB's `communityRatingCount` the same way, and no count when it is null or 0). The meta line keeps year, runtime and the show's air span and season count.
7. **Crew and Facts.** "Directed by" and "Written by" (movie) and "Created by" (show) as the web's crew lines under the overview. A Facts glass panel at the end, with the web's facts and order, each only when it has a value, and no panel at all when none does. Networks are names only (the web's logo tiles need a white or dark tile decision for the app; names are what always read, so the logos are left out).
8. **Section order** follows the web's minus the slice 3 extras: hero, actions, overview, crew, (show) rating and seasons, cast, Facts, catalog notice. The game keeps its current order with its hero restyled the same way.
9. **Season screen.** Gains a compact header: the season poster beside the show name kicker, the season name and its meta, under the solid header (no backdrop: TMDB seasons have none). Episode rows follow the web's row in a phone layout: a full width 16:9 still with the rim (or the icon tile), an `S1 · E3` kicker, the bold title, the date and runtime line, the TMDB pill, and three lines of overview, then the Watched toggle and score pill in one row. Specials keep their place and rules.
10. **Swipe to toggle watched.** A trailing swipe on an episode row (`ReanimatedSwipeable` from Gesture Handler 3) reveals one action, "Watched" or "Unwatch", and a full swipe fires it through the same `useTrackingWrite` path as the button, so the optimistic step, the revert toast, Undo and the haptic stay exactly as they are. The button stays. Unaired or undated episodes cannot be swiped. VoiceOver gets the same action as a custom accessibility action on the row. The root layout gains `GestureHandlerRootView`.
11. **"Clear rating" from core.** A `SCORE_SHEET_COPY` (or a `CLEAR_RATING_LABEL`) constant in `packages/core/src/tracking/messages.ts`; the web's `score-picker.tsx` and the app's `score-sheet.tsx` both read it, so the app's button says "Clear rating" like the web. Its accessibility label keeps naming the title.
12. **Skeletons.** The movie, show and game loading states become a hero shaped skeleton (backdrop, poster, two lines, an action row) instead of the spinner, as the web's detail skeletons do; the season keeps `SeasonSkeleton`, restyled to the new row.

Assumption: `headerTransparent` with a Reanimated driven `headerBackground` works on Expo Router 58's native stack on iOS and Android. If the native header cannot take an animated background, the fallback is a custom header drawn by the screen (`headerShown: false` with a back button and the same fade), noted in the PR.

## Expected files

Changed:
- `packages/core/src/api/v1/movie.ts`, `show.ts` and their tests (new fields, nullable `cast`).
- `packages/core/src/tracking/messages.ts` (the Clear rating label).
- `apps/web/app/api/v1/movies/[id]/route.ts`, `apps/web/app/api/v1/shows/[id]/route.ts` and their tests.
- `apps/web/components/tracking/score-picker.tsx` (reads the label from core).
- `apps/mobile/src/app/_layout.tsx` (`GestureHandlerRootView`).
- `apps/mobile/src/screens/movie-screen.tsx`, `show-screen.tsx`, `season-screen.tsx`, `game-screen.tsx`.
- `apps/mobile/src/components/detail-header.tsx` (the hero), `episode-row.tsx`, `cast-row.tsx` (show cast and its error line), `score-sheet.tsx`, `skeleton.tsx` (hero skeleton).
- Their tests in `apps/mobile/src/__tests__/`.
- `apps/mobile/AGENTS.md` (the title header rule and the swipe rule), `docs/scope/scope.md` (slice 2 boxes, the age pill moved to slice 3).

New:
- `apps/mobile/src/components/title-header.tsx`: the stretchy backdrop, the header fade and the hook that wires a screen's scroll to its header (`useTitleHeader`).
- `apps/mobile/src/components/title-details.tsx`: `CrewLines` and `FactsPanel`, mirroring the web's names.
- `apps/mobile/src/components/swipe-row.tsx`: the one owner of `ReanimatedSwipeable` (only file importing the swipe API).
- Tests beside them.

No migration, no new dependency, no native rebuild (Gesture Handler and Reanimated are already in the build).

## Requirements

1. Every value shown comes from a v1 field that the web's normalized catalog type carries; a missing value hides its fact, pill or line, never "Unknown" or 0 (AGENTS.md section 14).
2. Community rating and personal score stay distinct: amber TMDB or IGDB pill with its source and vote count, cyan personal score (section 9).
3. The header never hides content: when the backdrop has scrolled under it the header is solid, and the title shows; the back button keeps 44pt.
4. A swipe and the button send the same request and produce the same toast, Undo and haptic; an unaired episode offers neither.
5. A failed show cast read leaves the rest of the show screen intact, with the cast error line.
6. Reduce Motion turns the stretch off and makes the header switch instantly; Reduce Transparency keeps the solid header path.
7. Every new control is 44pt, labelled, reachable by VoiceOver (swipe included, as a custom action); decorative artwork is hidden from screen readers.
8. Old app builds keep working against the new API answers (additive fields only).
9. No colour literal, no `react-native` `Text` import, no `expo-blur` outside `components/glass/` (the existing boundary tests).

## Security considerations

The two routes stay public, anonymous and cached as now; the new fields are public TMDB data already on the web pages. The show route's added cast read is the same cached server read the web uses, so no new TMDB credential reader. Nothing private enters a public answer; no write changes.

## Acceptance criteria

- **AC-1**: Movie, show and game screens open with the full bleed backdrop under a transparent header; scrolling hands over to a solid header with the title; pulling down stretches the backdrop; Reduce Motion stops the stretch.
- **AC-2**: On a 375 by 812 screen the main tracking actions are visible without scrolling on a movie, a show and a game.
- **AC-3**: Genres and status show as glass pills, the community pill has its vote count, and the crew lines show under the overview when TMDB has names.
- **AC-4**: The Facts panel lists the web's facts for a movie and a show, omits each missing one, and is absent when none has a value.
- **AC-5**: The show screen has a Cast row; when only the cast read fails it shows the error line and the rest of the screen.
- **AC-6**: The season screen has its poster header and the new episode rows; swiping an aired episode marks or unmarks it with the same toast, Undo and haptic as the button; an unaired one cannot be swiped; VoiceOver offers the action.
- **AC-7**: The score sheet's clear button reads "Clear rating" on the app and the web, from core.
- **AC-8**: Movie, show and game loading show a hero skeleton, not a spinner.
- **AC-9**: `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (core contracts, both route tests, the mobile screen tests), `pnpm build` (route handlers change). From `apps/mobile`: `npx expo-doctor`.

## Manual test steps

1. `orb start`, then `pnpm exec supabase start`; `pnpm dev:docker` from the repo root.
2. From `apps/mobile`, `npx expo start --dev-client` and open the existing development build in the iOS Simulator (no rebuild needed).
3. Open a movie with a backdrop (for example Dune: Part Two): the backdrop sits under a clear header; scroll up and the header turns solid with the title; pull down and the backdrop stretches. Check the genre and status pills, the vote count, Directed by and Written by, and the Facts panel at the end.
4. Open a show (for example Severance): the same header, the Cast row and the show Facts with Networks.
5. Open a movie with no backdrop and a game with no art: the header starts solid and nothing is blank.
6. Sign in, open a season: swipe an aired episode left to mark it watched, see the toast, press Undo; swipe an unaired one and nothing reveals. Mark another with the button and compare.
7. Score an episode, open the sheet again: the button reads "Clear rating" and clears it. Check the same button on the web at `http://localhost:3000`.
8. Turn on Reduce Motion: no stretch, the header switches at once. Turn on VoiceOver on a season: the episode row offers the watched action.
9. Compare a movie and a show with the web at 375px in the browser pane for material, colour, radius and type.
