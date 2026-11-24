# Mobile: the web's look, a native feel (foundation)

## Goal

The Expo app takes the shipped web UI's **visual language** (warm page background, frosted glass with gradient rims and sheen, Inter, lucide and the tracking icons, `GlassPill` badges, skeletons, glass state panels) while its **layout and interaction follow the platform** (HIG on iOS, Material on Android). It is not a 1:1 copy of the web: where the web's layout and a mobile convention disagree, the mobile convention wins.

This plan is the **foundation**: the shared pieces every screen draws from, applied to the components that already exist so every screen picks up the new look at once. Per screen layout changes and missing features come later, one plan and one PR per slice (Roadmap below).

Decided with the owner on 2026-11-23 (design interview, four rounds).

## Progress (2026-11-23, paused here by your call)

Superseded: the foundation merged in [PR #99](https://github.com/kris1027/BeStats/pull/99) on 2026-11-23; its final status, device passes included, is slice 1 in [docs/scope/scope.md](../docs/scope/scope.md). The note below is kept as it was.

Done and committed on `feat/mobile-web-parity-foundation` (not pushed): the sRGB and glass token copies, the native dependencies with Inter embedded (`expo-font` plugin, not `@expo-google-fonts` at runtime: a deviation from decision 8 that removes the load step), the theme, `GlassPlate`, `Rim`, `PageBackground`, the Inter `Text` wrapper and the boundary test. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass there; nothing has run in the simulator yet. One deviation from the expected files: `fonts.ts` is `components/text.tsx`, and `use-reduce-transparency.ts` is `glass/use-frosted.ts`.

The icons, `GlassPill`, skeletons and the glass `StatePanel` are half built on the local branch `wip/mobile-parity-components`, with failing screen tests. What is left, in order, is the feature 29 checklist in [docs/scope/scope.md](../docs/scope/scope.md). Native headers take `color-page-top` for now (no seam with the background); the title and list slices give them large titles or a backdrop.

## Inspected

- **`apps/mobile/src/components/`**: `glass-button.tsx` (one size; selected is a 1px cyan border, `primary` is solid white), `centered-state.tsx` (`LoadingState` is a spinner, `StatePanel` has no surface or icon), `notice.tsx`, `poster-card.tsx` (ratings as coloured text, a 1px border on the missing poster tile, `borderRadius: 12` literal), `toast.tsx`, `score-sheet.tsx`, `filters-sheet.tsx`, `chevron-row.tsx`, `form-field.tsx`, `library-card.tsx`, `card-action-button.tsx`, `episode-row.tsx`, `season-nav.tsx`, `detail-header.tsx`.
- **`apps/mobile/src/theme/token-vars.ts`** and **`src/global.css`**: colour tokens only. oklch tokens (every `color-page-*` the background needs) are filtered out because React Native cannot draw oklch.
- **`packages/core/scripts/tokens.ts`** and **`src/tokens.generated.ts`**: the generated copy already carries `frost-*`, `blur-*`, `radius*` and `page-*-alpha`, unused by the app so far.
- **`apps/web/app/globals.css`**: the `glass` utility (169deg sheen, 12% white top stop), `glass-rim` and `glass-rim-score` (166deg 1.5px stroke), `glass-plate-*` (colour × frost opacity + blur), `glass-shadow` (`0 5px 10px rgb(6 10 25 / 0.22)`), the `page-*` background layers, and the reduced transparency fallback (frost 100%, no blur).
- **`apps/web/components/AGENTS.md`**: the plate rule, the three meaning colours (amber community rating, cyan personal score, green Planned), `GlassPill`, `StatePanel`'s mandatory action rule, card corners and `CARD_PILL`.
- **`apps/mobile/package.json`**: `expo-blur` and `expo-font` are installed and unused; `react-native-svg`, `lucide-react-native`, `@expo-google-fonts/inter` and `expo-haptics` are absent. React Native 0.88 has `backgroundImage` (gradients), `boxShadow` and `mixBlendMode` styles; Expo Router 58 has `Link.Menu` and `Link.Preview`.
- **Design audit** (code only; no screenshots, since that would have needed OrbStack, local Supabase and both dev servers): 18 missing foundation pieces, the largest gaps being glass, background, type, icons and badges.

## Skills used

`expo-design-system` (tokens and component structure), `vercel-react-native-skills` and `react-native-best-practices` (blur cost on scrolling lists, re-renders), `react-native-testing` (RNTL v14), `expo-dev-client` (the native rebuild). Before writing code against `expo-blur`, `expo-font`, `expo-haptics`, `react-native-svg` and RN's `backgroundImage`, read the SDK 58 docs (`https://docs.expo.dev/versions/v58.0.0/`), as `apps/mobile/AGENTS.md` asks.

## Decisions

1. **Visual language from the web, layout and interaction from the platform.** This plan carries the visual language only; screen layout belongs to the slices.
2. **Still background.** It has the web's layers in paint order (gradient, three blobs, stripes, wash, vignette, grain) at their still positions, with no motion of any kind. The owner dropped parallax for good.
3. **Frosted glass on iOS only.** Plates are `BlurView` (`expo-blur`) at the web's frost opacity and blur per role (control, panel, sheet, float, score). Android, and iOS with Reduce Transparency on (`AccessibilityInfo.isReduceTransparencyEnabled` plus its change event), get the web's fallback: opaque plates, no blur. This is the same rule the web applies to `prefers-reduced-transparency`.
4. **Only the outermost large surface blurs**, as on the web: a row inside a panel takes no plate of its own. Poster card badges use `plate-solid` (opaque) because they sit over artwork, so a grid of cards never stacks blur views.
5. **The rim is drawn with SVG** (`react-native-svg`, a rounded `Rect` stroked with the 166deg `linearGradient`, absolutely placed and sized by `onLayout`), because React Native has no gradient border. The plate sheen uses React Native's `backgroundImage`. The page background is one SVG (amended after review): `backgroundImage` has no repeating pattern for the pinstripe and no elliptical radial gradient for the vignette, so its layers are drawn with `react-native-svg` too. The shadow is `boxShadow` with the web's value.
6. **oklch becomes sRGB in the generated copy.** `pnpm tokens` also writes each oklch colour converted to sRGB hex (a pure conversion in `packages/core/scripts/tokens.ts`, no new dependency), so the app draws the page colours without holding a colour literal. `globals.css` stays the one source.
7. **Grain is a PNG tile** rendered once by a script with `sharp` (already a devDependency, as `brand-icons` does), since React Native cannot run `feTurbulence`. It is drawn at the web's `--page-grain-alpha` with `mixBlendMode: "overlay"`.
8. **Inter, scaling with the system text size.** `@expo-google-fonts/inter` loaded with `expo-font` before the launch overlay is ready; the weights the web uses (400, 500, 600, 700, 800). Text keeps `allowFontScaling` and gets a `maxFontSizeMultiplier` cap on fixed-height controls (pills, tab-like toggles) and on the fully rounded `GlassButton` (amended after the largest text pass in the simulator: a wrapped label cut into the round ends), so Dynamic Type never clips them.
9. **Icons**: `lucide-react-native` for the lucide set the web uses, and the web's custom tracking icons (Plan, Planned, Watched, Next episode) ported as `react-native-svg` components in `src/components/icons/`, path for path from the web's SVGs. Text glyphs (★ ✓ × › ‹) go.
10. **Haptics** through one wrapper, `src/lib/haptics.ts` (`expo-haptics`): a medium impact on a confirmed tracking write (watched, planned, score set, Undo; changed from light on 2026-11-24, your call: on a real iPhone the light tap could not be felt while the error buzz could) and the error notification on a failed one. It fires only from `useTrackingWrite` (an Undo's restore is one of those writes, so `useUndoToast` needs none; amended 2026-11-24 to match the code), so no screen calls Haptics directly, and it fires after the server confirms or refuses, never on the optimistic step alone.
11. **Radius scale** mirrors the web: the `radius*` tokens (`--radius` 0.75rem = 12pt, `radius-panel` 24pt) read from the generated copy into NativeWind's `@theme`, replacing Tailwind defaults and the `borderRadius: 12` literal.
12. **Selected styles** follow the web: `glass-selected` (brighter, solid plate) replaces solid white `bg-primary`, and the personal cyan selected toggle (`glass-selected-personal`, dark `text-on-personal`) is used where the web uses it (the media type switch).
13. **Existing components are restyled in place** (`GlassButton`, `StatePanel`, `Notice`, `PosterCard`, toast, sheets, `ChevronRow`, `FormField`), keeping their props and their accessibility names, so every screen, Home included, picks up the look without a layout change.
14. **Home keeps its layout.** It only gets the background, cards and pills through the shared components (owner, Q6).

## Assumptions

- `expo-blur` 58's `BlurView` intensity and tint can match the web's 12 to 24px blur closely enough by eye. The values are tuned once in the simulator against a web screenshot and recorded as named constants, not per screen.
- A still SVG rim per surface is cheap enough on a scrolling list, because card badges are opaque and carry no rim of their own beyond the poster's image rim. If profiling shows dropped frames on a library grid, the poster rim falls back to a solid 1.5px border at the rim's mid colour, which is noted in the PR.
- The new native dependencies (`react-native-svg`, `lucide-react-native`, `@expo-google-fonts/inter`, `expo-haptics`) need a fresh development build and, for testers, a new store build: EAS Update cannot deliver them. `runtimeVersion` follows `version`, so `version` in `app.json` gets a minor bump.

## Expected files

New:
- `apps/mobile/src/components/glass/plate.tsx`: `GlassPlate` (role: control, panel, sheet, float, score; `solid` flag), the one owner of `BlurView`, the reduced transparency fallback, the sheen and the rim.
- `apps/mobile/src/components/glass/rim.tsx`: the SVG gradient rim (`default` and `score`).
- `apps/mobile/src/components/glass/use-reduce-transparency.ts`.
- `apps/mobile/src/components/page-background.tsx`: the still background, rendered once behind the root stack.
- `apps/mobile/src/components/glass-pill.tsx`: `GlassPill` plus `CommunityRatingBadge` (TMDB or IGDB, amber), `PersonalScoreBadge` (cyan, score rim) and `CalculatedRatingBadge`, mirroring the web's names.
- `apps/mobile/src/components/skeleton.tsx`: `Skeleton` (poster, pill, line), opaque and rimmed like the web's `plate-rim plate-solid`, with a pulse that stops under Reduce Motion.
- `apps/mobile/src/components/icons/` (tracking icons) and `index.ts` re-exporting the lucide icons in use.
- `apps/mobile/src/lib/haptics.ts`, `apps/mobile/src/theme/fonts.ts`.
- `apps/mobile/assets/images/grain.png` and `apps/mobile/scripts/grain.mts` (`pnpm grain`).
- Tests beside each new file.

Changed:
- `packages/core/scripts/tokens.ts`, `packages/core/src/tokens.generated.ts` (sRGB copies of the oklch tokens), `packages/core/src/tokens.test.ts`.
- `apps/mobile/src/theme/token-vars.ts`, `apps/mobile/src/global.css` (page colours, radius scale, font families), `token-vars.test.ts`.
- `apps/mobile/src/app/_layout.tsx` (fonts, background, transparent navigation theme background).
- `apps/mobile/src/components/glass-button.tsx`, `centered-state.tsx`, `notice.tsx`, `poster-card.tsx`, `toast.tsx`, `score-sheet.tsx`, `filters-sheet.tsx`, `chevron-row.tsx`, `form-field.tsx`, `media-switch.tsx`, `library-card.tsx`, `card-action-button.tsx`, `rating-line.tsx`, and their tests.
- `apps/mobile/src/lib/tracking.ts` (haptics in `useTrackingWrite` and `useUndoToast`).
- `apps/mobile/package.json`, `pnpm-lock.yaml`, `app.json` (`version`).
- `apps/mobile/AGENTS.md` (the glass, background, icon, font and haptics rules), written on the branch as each piece landed rather than through `/sync` after merge.
- `apps/web/design-tokens-boundary.test.ts`: its colour exemption covers `packages/core/scripts/tokens.ts` and `tokens.test.ts`, which hold the oklch to sRGB conversion decision 6 needs. The web's pages are not changed.

## Requirements

1. Every screen draws over the still page background; no screen paints an opaque full-screen background over it (the app's form of the web's shell rule).
2. Every glass surface goes through `GlassPlate`; no screen imports `BlurView` or draws its own rim (a boundary test walks `src/` for `expo-blur` imports outside `components/glass/`).
3. Plate opacity and blur per role come from the generated `frost-*` and `blur-*` tokens; no number is restated in a component.
4. On Android and under Reduce Transparency every plate is opaque and nothing blurs; toggling Reduce Transparency while the app is open updates the plates without a restart.
5. Text over every plate keeps 4.5:1 against the background's brightest still pixel. A mobile test recomputes it from the generated tokens, as `app/glass-contrast.test.ts` does on the web.
6. The three meaning colours keep their meanings: amber only on community ratings, cyan only on the personal score (and the selected media toggle, the web's one exception), green only on Planned. A community rating badge always names its source (TMDB or IGDB), and the personal and community badges never share a tone (AGENTS.md section 9).
7. No colour literal in the app (`design-tokens-boundary.test.ts` keeps passing); the grain PNG is generated, never hand edited.
8. Every control stays at least 44pt tall or carries a 44pt `hitSlop`; Inter at the largest Dynamic Type size never clips a button, pill or toggle label.
9. Every icon-only control keeps an accessibility label; decorative icons are hidden from screen readers.
10. Haptics fire only on a server-confirmed or refused write, never on a read, a scroll or an optimistic step; none fires when the write was cancelled by a sign out.
11. Loading states that are a whole screen keep an accessible label; skeletons are hidden from screen readers and the screen announces loading once.
12. Existing behaviour is unchanged: every current test keeps passing, apart from assertions on class names this plan replaces.

## Review deviations (2026-11-23)

Kept after the code review, by the owner's call:

- `StatePanel` gives an error panel with no action of its own Go back, or Go to Home when there is nothing to go back to (a deep link), so no error panel is a dead end (AC-5, components/AGENTS.md).
- `SHEET_DIM` in `score-sheet.tsx` (the dim behind the score sheet) and the native header's flattened page colour (`tokenColorOver` in `theme/stack-options.tsx`) came out of the simulator pass and are recorded in docs/scope/scope.md.
- Decisions 5 and 8 and AC-4 are amended in place above.
- A failed haptic is swallowed in a store build and logged (`console.warn`, `__DEV__` only) in a development build, added 2026-11-24 after a real iPhone stayed silent, so a missing native module shows in Metro (`src/lib/haptics.ts`).

## Security considerations

None new: no data, route, request or secret changes. The fonts ship inside the app bundle (no runtime font fetch, so no new processor and no change to `PROCESSORS`, `/privacy` or the store answers). The new packages are installed through `npx expo install` at SDK-pinned versions.

## Acceptance criteria

- **AC-1**: On the iOS Simulator, every screen shows the warm background, and its panels, pills and buttons are frosted with the gradient rim and sheen. Compared side by side with the web at 375px, the materials, colours, radii and type read as the same brand.
- **AC-2**: On an Android emulator, and on iOS with Reduce Transparency on, the plates are opaque with no blur, and the text contrast test passes for both modes.
- **AC-3**: Inter renders everywhere; at the largest accessibility text size no control label is clipped.
- **AC-4**: Ratings render as `GlassPill` badges (community amber with its source name announced to screen readers, as the web's `sr-only` text, personal cyan with the score rim) on the poster cards, title screens and episode rows; the text glyphs are gone.
- **AC-5**: Whole-screen and list loading show skeletons, not spinners; error and signed-out panels are glass with an icon and always an action.
- **AC-6**: Marking an episode watched gives a medium haptic once the server confirms; a refused write gives the error haptic and the existing reverting toast.
- **AC-7**: Home's layout is unchanged apart from the shared background, cards and pills.
- **AC-8**: `pnpm typecheck`, `pnpm lint`, `pnpm test` pass, including the new boundary, contrast and token tests.

## Automated checks

From the repo root: `pnpm tokens` (then confirm `tokens.test.ts` passes), `pnpm typecheck`, `pnpm lint`, `pnpm test`. From `apps/mobile`: `npx expo-doctor`. `pnpm build` is not needed (no web route, config or server code changes), but `pnpm test` covers the web's token boundary tests.

## Manual test steps

1. `orb start`, then `pnpm exec supabase start`; `pnpm dev:docker` from the repo root.
2. Rebuild the development client for the new native modules: from `apps/mobile`, `npx expo run:ios` (simulator), then `npx expo start --dev-client`.
3. Open Home: the warm background shows behind the sections, the media switch is lit cyan, and the cards' ratings are amber TMDB pills. Pull to refresh still works.
4. Open a movie, a show, a season and a game: panels are frosted with a visible rim; ratings are pills; the score badge is cyan with its rim. Mark an episode watched and feel for the haptic (on a real iPhone; the simulator has none), then use Undo.
5. Open Search, Library and Account while signed out: the signed-out panels are glass, with an icon and Sign in.
6. Turn on Settings → Accessibility → Display & Text Size → Reduce Transparency: the plates go opaque without restarting the app. Turn it off again.
7. Set Larger Text to the maximum: no button, pill or toggle label is clipped.
8. Turn off the network (`OfflineBanner` shows), open a title whose catalog read fails: the error panel is glass with Retry.
9. Open `http://localhost:3000` in the browser pane at 375×812 beside the simulator and compare Home and a movie page for material, colour, radius and type (not layout).
10. Run the app on an Android emulator (`npx expo run:android`): every plate is opaque, nothing blurs, and scrolling Library stays smooth.

## Roadmap (one plan and PR each, after this one)

1. **Title pages**: a stretchy full-bleed backdrop that collapses into a transparent native header (no scroll parallax), the main actions within thumb reach below it, the web's genre, status and age pills and vote counts, the Facts panels, the show cast row, season and episode layout, swipe to toggle watched on episode rows (the check button stays), and "Clear rating" in the score sheet from core's messages.
2. **Title extras**: trailer, Where to watch, More like this, through new `/api/v1` reads.
3. **Catalog card actions**: Plan and Watched in a long-press `Link.Menu` with `Link.Preview` on catalog and search cards (3 columns on phones, more on tablets). This was not in the agreed slice list; it is split out here because it needs per-card tracking state, which the foundation does not read. Confirm or fold it into Search.
4. **Search**: large-title header, the new cards, the games Platforms filter.
5. **Library**: the new cards, with their visible quick action button kept.
6. **Account, auth and About**: the auth panel content (taller fields, password visibility toggle, inline errors) inside the existing modals, Change password, the Delete account screen restyled (still pushed), and the icon key and `kris1027` credit on About.

Kept native in every slice: the tab bar, stack headers, swipe back, the auth modals, the score bottom sheet and infinite scroll. Each slice's screenshot check compares visual language, not layout. The web is not changed by any of them.
