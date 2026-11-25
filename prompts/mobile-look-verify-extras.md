# Mobile: the four build items from the mobile look verify run

## Goal

Close the four findings from `/check verify mobile look` (run 1, 2026-11-25) that need building rather than a bug fix, so the app matches the web there (feature 29, `docs/scope/scope.md`):

1. The show screen has no tagline; the web shows it under the title ("Welcome to a future we no longer control." on Blade Runner 2099, `/shows/171802`).
2. Taglines can't be italic: only the upright Inter weights are embedded, so `italic` on the movie tagline renders upright.
3. The Library Up next pill has no TV icon, and the card has no episode name under the title (the web shows "Ho, Ho, Folks").
4. Account's loading state is the default `PageSkeleton` (a heading, lines, pills and three poster cards). Account has no posters, so the skeleton should be its own panels and rows (AC-5, "skeletons in the shape of what is coming").

The other three findings were bugs, fixed with these four on the branch of PR #113.

## Inspected code

- `apps/mobile/src/screens/movie-screen.tsx:119`: the movie tagline is `<Text className="italic text-text-secondary">` between the tracking controls and the overview.
- `apps/mobile/src/screens/show-screen.tsx:124`: the same column, with no tagline. `v1ShowSchema` (`packages/core/src/api/v1/show.ts:64`) already carries `tagline: string | null`.
- `apps/mobile/assets/fonts/`: Inter 400, 500, 600, 700 and 800, upright only. They match `@expo-google-fonts/inter@0.4.2` byte for byte (already in the pnpm store, a dependency of the workspace), which also ships `400Regular_Italic/Inter_400Regular_Italic.ttf` under the same OFL licence (`OFL.txt` is already committed). `app.json` registers them through the `expo-font` plugin: a file list on iOS, and `fontDefinitions` with weights for the `Inter` family on Android. `components/text.tsx` sets `fontFamily: "Inter"` on every `Text`.
- `apps/mobile/src/lib/library-card.ts:192`: an Up next card's pill is `NEXT_EPISODE_MESSAGES.pill(season, episode)` with no icon; `components/library-card.tsx:173` draws it as a plain `GlassPill`, which takes an `icon` prop. The app already has the web's `NextEpisodeIcon` in `components/icons/tracking-icons.tsx`.
- `/api/v1/me/library` gives an Up next place only as `{ season, episode }`. The web's `NextEpisodeName` (`apps/web/components/library/watchlist-show-controls.tsx`) reads the season per card and streams the name in, showing nothing while it loads, when TMDB has no name, or when the read fails.
- `apps/mobile/src/lib/library-actions.ts:403`: the Up next quick action already reads that season with `catalogKeys.season(showId, n)` and `fetchSeason`, so a card's query and the action share one cached read.
- `apps/mobile/src/screens/account-screen.tsx:64` and `:89`: both loading states use `LoadingState` with its default `page` layout. Signed in, Account is a column of `GlassPanel`s: the header (username in bold, email, Sign out), the username panel (label, field, Save) and the rows panel (Change password, Delete account, About as `ChevronRow`s). `components/centered-state.tsx` picks a skeleton by `layout`: `page`, `grid` or `title`.

## Skills used

`expo-design-system` (reuse `Skeleton` shapes and `GlassPanel`, no new tokens), `tanstack-query` (a shared query key), `react-native-testing` (RNTL v14). Expo font docs for SDK 58 (`expo-font` config plugin, Android `fontDefinitions` with `style`).

## Decisions

1. **Show tagline:** the movie screen's tagline line, the same place (after the tracking controls, before the overview) and the same classes. Nothing when the tagline is null or empty.
2. **Italic:** embed `Inter_400Regular_Italic.ttf`, copied from the installed `@expo-google-fonts/inter@0.4.2`, so there's nothing to download. Register it in `app.json`: on iOS beside the others, where UIKit matches the `Inter` family's italic face by its own traits; on Android as a `fontDefinitions` entry with `weight: 400, style: "italic"`. Only the 400 weight, because both taglines are regular weight; any other italic weight would be faked by the system (slanted) rather than missing. This needs a new development build (`npx expo run:ios`), since fonts are native assets.
3. **Episode name (your choice, 2026-11-25):** each Up next card reads its season through the public `/api/v1/shows/{id}/seasons/{n}` (`useQuery` on `catalogKeys.season`, the key the quick action already uses). The card draws at once and the name appears under the title when the read lands, as on the web. It shows nothing while loading, when TMDB has no name, or after a failed read, because the pill and the quick action already cover those states. No API change.
4. **TV icon:** the Up next pill takes `NextEpisodeIcon` through `GlassPill`'s `icon`, as the web's `NextEpisodePill` does. The view model gets an optional `icon: "next-episode"` on the pill, so `library-card.ts` stays pure and only the component maps it to the icon.
5. **Account skeleton (a new layout, for your approval):** a new `layout="account"` on `LoadingState`, drawing `AccountSkeleton` in `skeleton.tsx`:
   - a panel with a bold line (about 50% wide), a shorter line under it, and a 44pt button pill;
   - three rows under it, each a 56pt bar the width of the column with the panel radius.

   Built differently from first planned (a panel of three 44pt rows): Account draws its rows as standalone 56pt `ChevronRow`s, not inside a panel, so the skeleton follows the screen. The header panel sits in `GlassPanel`'s padding and the rows in the screen's gap, so nothing jumps when the real ones arrive. The username panel is left out because it only shows for some accounts. Both of Account's loading states use it: the session read and the profile read. Signed out isn't affected.

## Assumptions

- On iOS, registering a second file in the same `Inter` family is enough for `fontStyle: "italic"` (the `italic` class) to pick it. If it isn't, the fallback is naming the family on the tagline (`Inter-Italic`). I'll check this in the simulator before building on it.
- The season reads are cached as public catalog data (`CATALOG_QUERY_ROOT`), so sign out keeps them, and a page of 24 Up next cards costs at most one read per distinct show season.

## Expected files

New: `apps/mobile/assets/fonts/Inter_400Regular_Italic.ttf`, `apps/mobile/src/components/library-card.test.tsx` (or additions to an existing library test), a skeleton test.
Changed: `apps/mobile/app.json`, `screens/show-screen.tsx`, `lib/library-card.ts` (and its test), `components/library-card.tsx`, `components/skeleton.tsx`, `components/centered-state.tsx`, `screens/account-screen.tsx`, `apps/mobile/AGENTS.md` (the fonts line), `docs/scope/scope.md`, this plan.

## Requirements

1. A show with a tagline shows it italic in `text-secondary` after the tracking controls; a show without one shows nothing there.
2. Both taglines render in real Inter Italic on iOS (and Android, by the same plugin).
3. An Up next card's pill shows the TV icon before "S1E3"; the pill's accessible label is unchanged. The card's own label gains the episode name once it loads (requirement 4), so a screen reader hears what the card shows.
4. An Up next card shows the next episode's name under the show name once its season loads, and nothing while loading, when the name is null, or when the read failed. No other library page reads a season.
5. Account shows the panel shaped skeleton while the session or profile loads, with the progress label kept for screen readers.
6. No colour literal, no new token; the boundary tests keep passing.

## Security considerations

None new: the season read is the public catalog route the app already calls, holds no user data, and stays under the catalog cache root. The font is OFL licensed, from the same family and licence file already committed.

## Acceptance criteria

- Blade Runner 2099 (`/shows/171802`) shows "Welcome to a future we no longer control." in italic.
- A movie tagline is visibly italic (compared with the upright overview).
- Library, Shows, Up next: each card's pill has the TV icon, and the name of the next episode appears under the show name.
- Account, signed in, cold start: the skeleton shows the header panel and three row bars, no poster cards.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (new tests: show tagline present or absent; the Up next view carries the icon; the card shows the episode name from a mocked season and nothing when the read fails; `LoadingState layout="account"` draws no poster skeleton). `npx expo-doctor` after the `app.json` change. No `pnpm build` (no web change).

## Manual test steps

1. Run `npx expo run:ios` from `apps/mobile` (a new development build, because of the font), then open the app against the local stack.
2. Open Blade Runner 2099 and check the tagline under the tracking controls, in italic.
3. Open any movie with a tagline and check it's italic.
4. Sign in with an account that tracks a show with an episode left, open Library, Shows, Up next: check the TV icon in the pill and the episode name under the title. Turn on airplane mode, pull to refresh, and check the card still shows without a name.
5. Quit the app, open it on Account while signed in, and watch the skeleton: two panels, no posters.

## Review fixes (2026-11-25)

From `/mattpocock-skills:code-review` against `main`:

- The tagline is one `Tagline` in `components/title-details.tsx`, drawn by both title screens.
- The Up next card and its Mark watched action find the next episode through one `findEpisode` (`lib/catalog.ts`), typed by core's `EpisodePlace`.
- The pill's icon key became a `nextEpisode` flag; `LoadingState` picks its skeleton from a map.
- Home's section blurb is back under the title, inside the baseline row's title column, as before the See all fix (the web draws it under the heading too).
- Regression tests for the two `/debug` fixes that had none: Search commits no frame of the old type's results under the new tab (`catalog-screens.test.tsx`, fails on the effect version), and Home's header row is baseline aligned with the blurb in the title's column (`landing-section.test.tsx`).
- Verify is unticked in scope.md until the Up next card and Account's skeleton are seen on screen.
