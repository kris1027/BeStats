# Mobile media switch: Liquid Glass bar pinned at the top (feat/mobile-media-switch-glass)

## Goal

Make the Shows, Movies, Games switch on Home, Search and Library look like the native bottom tab bar (an icon over each label, a darker selected capsule, real iOS Liquid Glass) and pin it at the top of those screens as a floating bar that content scrolls under. Decided in a grilling session with the user on 2026-11-25 (14 questions, all answered; the user's sketch shows the target).

## Inspected code

- `apps/mobile/src/components/media-switch.tsx`: `MediaSwitch` (Home, Search, through `useMediaType`) and `MediaSwitchView` (Library, its own type); a `GlassPlate` with a cyan `sheen="personal"` selected segment, text only, 44pt segments, `tablist`/`tab` roles.
- `apps/mobile/src/app/(tabs)/_layout.tsx`: `NativeTabs`, SF Symbols with Material (`md`) names, tint `color-primary`.
- `apps/mobile/src/app/(tabs)/(index,search,library,account)/_layout.tsx`: the tab stacks, `tabScreenLayout(["search", "library", "account"])`, Home's `title: "BeStats"` header, `SEARCH_SCREEN_OPTIONS` and `LIBRARY_SCREEN_OPTIONS`.
- `apps/mobile/src/theme/stack-options.tsx`: `largeTitleScreenOptions`, `STACK_SCREEN_OPTIONS`.
- `apps/mobile/src/screens/home-screen.tsx`, `search-screen.tsx` (native header search bar through `navigation.setOptions`, switch in the list header), `library-screen.tsx` (switch then `PagePills` in the list header).
- `apps/mobile/src/components/glass/plate.tsx`, `glass/rim.tsx`, `page-background.tsx` (SVG gradients), `components/icons/index.ts`, `src/theme/pill.ts`, `src/theme/ui-boundary.test.ts`.
- Tests using the switch: `src/__tests__/catalog-screens.test.tsx`, `src/__tests__/library-screen.test.tsx` (by role `tab`).
- Expo SDK 58 docs: `expo-glass-effect` (`GlassView`, `GlassContainer`, `isLiquidGlassAvailable`, `isGlassEffectAPIAvailable`; iOS 26+, a plain `View` elsewhere; no opacity below 1 on the glass or its parents) and `expo-symbols` (`SymbolView`, `name={{ ios, android }}`, SF Symbols on iOS, Material Symbols on Android).

## Skills used

`grilling` (decisions), `expo-router` (native stack header, search bar), `expo-design-system` and `react-native-testing` for the build. Versioned docs per `apps/mobile/AGENTS.md`.

## Decisions and assumptions

1. Home, Search and Library all get the new switch; it stays one shared component (`MediaSwitchView`, with `MediaSwitch` reading `useMediaType`). (Q1)
2. Material: real Liquid Glass through `expo-glass-effect`. The bar is a `GlassView` (`regular`) holding our own `Pressable` segments; the selected segment sits on an inner interactive glass capsule tinted darker with a token colour (`tokenColorAlpha`). Not `@expo/ui`'s segmented `Picker`, which cannot put an icon over a label. (Q2, Q6)
3. No cyan. The selected segment is the darker capsule with the foreground (white) label, as the bottom bar in the sketch; unselected labels and icons stay the foreground colour. (Q3)
4. Icons are SF Symbols through `expo-symbols`, with Material Symbols on Android, matching `NativeTabs`: Shows `play.tv.fill` / `live_tv`, Movies `movieclapper.fill` / `movie`, Games `gamecontroller.fill` / `sports_esports`. They enter only through `@/components/icons` (a `MediaSymbol` wrapper there), like lucide. Fixed size (24pt), never scaled by Dynamic Type. (Q4, Q10)
5. Placement: a fixed floating bar; content scrolls beneath it. (Q5)
   - Home: right under the status bar. Home's native header (`title: "BeStats"`) is hidden, since the sketch shows no title above the switch.
   - Search: the large title goes; the native header stays with only the search field (no title text, `hideWhenScrolling: false`), and the switch pins right under the header (its height from `HeaderHeightContext`). (Q8, Q11)
   - Library: the large title and header go; the switch pins under the status bar. `PagePills` stay in the scrolling content. (Q8, Q12)
   - Account keeps its large title, unchanged. (Q13)
   - The switch shows only on these three tab roots, never on pushed screens.
6. A short fade in the page background colour sits behind the status bar and the switch, so content scrolling under them never clashes (an SVG `LinearGradient` from a token, as `page-background.tsx` does). (Q14)
7. Fallback: where Liquid Glass is unavailable (iOS below 26, Android, `isGlassEffectAPIAvailable()` false) or Reduce Transparency is on (`useReduceTransparency`, which `isLiquidGlassAvailable` ignores), the same layout draws on `GlassPlate` with its rim and shadow, the selected capsule a darker `GlassPlate`. (Q7)
8. `expo-glass-effect` is imported only under `components/glass/` (a `glass/liquid-bar.tsx` piece the switch composes), extending the `ui-boundary.test.ts` rule that already holds `expo-blur` there; `expo-symbols` only under `components/icons/`.
9. Labels stay one line, capped at `PILL_FONT_SCALE_CAP` (1.4×). Segments stay at least 44pt tall; the bar grows to fit icon + label. (Q10)
10. The content's top padding equals the bar's measured height (plus the status bar or header height on Android, which has no automatic inset), and `progressViewOffset` moves the pull-to-refresh spinner below the bar on both platforms. Every state (loading, empty, error) starts below the bar. Build deviation: an extra iOS `contentInset` arrived after the list's first layout and left it starting under the bar, so padding replaced it.
11. Dependencies: `npx expo install expo-glass-effect expo-symbols` (SDK 58 versions, ~58.0.5). Both are native modules, so the dev client needs a rebuild before testing; an OTA update cannot ship this to older builds. (Q9)
12. Accessibility is unchanged: `tablist` on the bar, `tab` with `selected` on each segment, the label as the accessible name (the icon hidden from screen readers), visible pressed state.

## Follow-up: Search's field under the switch (2026-11-25)

After seeing the build, the user asked for the switch above the search field on Search. The native header search bar can only sit above screen content, so Search's header is hidden like Home's and Library's, and `components/search-field.tsx` (the same glass as the switch, a search icon, a 44pt Clear search button, `MAX_QUERY_LENGTH` cap, `returnKeyType="search"`) is pinned under the switch. Dragging the results dismisses the keyboard. This replaces decision 5's Search bullet and Q11's answer (a). `src/__tests__/search-header.test.tsx` became `search-field.test.tsx`, driving the field.

## Follow-up: selection motion like the tab bar (2026-11-25)

The user asked for the switch's transition to match the native tab bar's. One absolutely positioned capsule (no children, so its `translateX` and `width` re-lay out nothing else) now sits behind the segments instead of each segment drawing its own fill. It springs (`{ duration: 450, dampingRatio: 0.75 }`, Reanimated, UI thread) to the segment under the finger on touch down and swells to 1.08, as the tab bar's glass lens does, settles back on release, and returns to the chosen segment if the touch is cancelled. The first placement and every move under Reduce Motion jump. Until the segments are measured the chosen segment draws the fill itself. The press dim is gone, as the tab bar has none. The Jest Reanimated stand in gained `withSpring` and `get`/`set` on shared values.

## Follow-up: drag between tabs (2026-11-25)

As on the iOS 26 tab bar, a sideways drag across the switch carries the capsule under the finger, swollen, and on release springs it to the nearest segment, which becomes the choice (`onChange` through `scheduleOnRN`). Gesture Handler v3's `usePanGesture` in a `GestureDetector` around the bar, its worklets on the UI thread; it activates after 8pt sideways and fails after 12pt vertical, so taps stay the segments' own `Pressable`s. While a drag holds the capsule, the press effect leaves it alone. `jest.setup.ts` stubs `GestureDetector` and `usePanGesture`; the drag is checked in the simulator, not in Jest.

## Expected files

- `apps/mobile/package.json`, `pnpm-lock.yaml` (two new deps)
- `apps/mobile/src/components/media-switch.tsx` (icon + label segments, new selected state, pinned bar wrapper)
- `apps/mobile/src/components/glass/liquid-bar.tsx` (new: `GlassView` bar and capsule with the `GlassPlate` fallback)
- `apps/mobile/src/components/icons/index.ts` and `icons/media-symbol.tsx` (new: the three `SymbolView` icons)
- `apps/mobile/src/components/top-fade.tsx` (new, or inside the switch file if small)
- `apps/mobile/src/screens/home-screen.tsx`, `search-screen.tsx`, `library-screen.tsx` (switch out of the list header into the pinned bar; content inset)
- `apps/mobile/src/app/(tabs)/(index,search,library,account)/_layout.tsx` and `src/theme/stack-options.tsx` (Home and Library header hidden; Search header with the search field only)
- `apps/mobile/src/theme/ui-boundary.test.ts` (glass-effect and symbols boundaries)
- `apps/mobile/jest.setup.ts` (stand-ins for `expo-glass-effect` and `expo-symbols`)
- `apps/mobile/src/components/media-switch.test.tsx` (new), updates to `catalog-screens.test.tsx` and `library-screen.test.tsx` if they relied on the switch in the list header
- `apps/mobile/AGENTS.md` (glass and icons lines), `prompts/mobile-media-switch-glass.md`

## Requirements

1. On Home, Search and Library the switch shows Shows, Movies, Games, each with its icon above its label, and stays fixed at the top while the content scrolls underneath.
2. On iOS 26+ without Reduce Transparency the bar and selected capsule are Liquid Glass; elsewhere the same layout draws on `GlassPlate`.
3. The selected segment is a darker capsule with a white label; no cyan remains on the switch.
4. Switching type behaves exactly as today: Home and Search share the type; Library changes its own type and keeps its page mapping (`libraryPath`).
5. Search keeps the native search field visible above the switch; Home and Library show no header title; Account is unchanged.
6. Nothing scrolls into view under the status bar without the fade; no state (loading, empty, error, signed out) hides under the bar; pull to refresh shows its spinner below the bar.
7. Labels one line up to the 1.4× cap; segments at least 44pt; roles and selected state announced.
8. No colour literal (`design-tokens-boundary.test.ts`); no opacity below 1 on a `GlassView` or its parents.

## Security considerations

None beyond the usual: a UI change with no data, auth or network path. The two new packages are first-party Expo SDK modules installed through `expo install`.

## Acceptance criteria

- AC-1: Home, Search, Library on iOS 26 show the pinned Liquid Glass switch with icons over labels, matching the sketch.
- AC-2: Content scrolls under the switch with the top fade; the switch never moves.
- AC-3: Search shows its native search field, then the switch, and searching and filters work as before.
- AC-4: Library's switch changes type and keeps the matching page; page pills scroll with the content.
- AC-5: Android and Reduce Transparency show the same layout on `GlassPlate`.
- AC-6: Largest Dynamic Type keeps every label on one line inside its segment; VoiceOver reads "Shows, tab, selected, 1 of 3".

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (mobile: the new `media-switch.test.tsx` for roles, selected state, `onChange`, and the fallback branch; `ui-boundary.test.ts` for the two import boundaries; the existing catalog and library screen tests still pass). No web code changes, so `pnpm build` and `pnpm test:db` are not needed. `npx expo-doctor` from `apps/mobile` after installing.

## Manual test steps

1. From `apps/mobile`: `npx expo install expo-glass-effect expo-symbols`, then rebuild the dev client: `npx expo run:ios` (iOS 26 simulator), then `npx expo start --dev-client --clear`.
2. Home: the switch sits under the status bar with no "BeStats" title; scroll down and posters pass under the glass and the fade; the switch stays put. Pull to refresh: the spinner shows below the switch.
3. Tap Movies, then Games: the darker capsule moves, the landing changes, and Search shows the same type.
4. Search: the search field sits at the top with no "Search" title, the switch under it; type a query, open Filters, open a title and come back: the query, filters and type survive.
5. Library (signed in): no title, the switch at the top, page pills below it; switch to Games: the matching game page opens; scroll: pills scroll away, the switch stays. Signed out: the signed out state starts below the switch.
6. Account: the large title is unchanged.
7. Settings > Accessibility > Display & Text Size > Reduce Transparency on: the switch draws on the blurred plate, same layout. Off again.
8. Largest Dynamic Type: labels stay on one line inside the segments. VoiceOver: each segment reads as a tab with its selected state.
9. Android emulator (`npx expo run:android`): Material icons, `GlassPlate` bar, same placement.
10. A pushed title screen (open a movie from Home) shows no switch.
