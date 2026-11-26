# Mobile title backdrop: clear top (feat/mobile-backdrop-clear-top)

## Goal

On movie, show and game screens in the mobile app, the artwork is sharp and at full brightness up to the screen's top edge. Remove the dark gradient behind the status bar and header, and hide the iOS 26 top scroll edge effect there.

## Inspected code

- `apps/mobile/src/components/title-header.tsx`: `TitleScroll`'s three branches; `Backdrop` draws a top scrim (`SCRIM_ALPHA` 0.75 across the header, lifting over `SCRIM_FADE` 128pt) and a bottom page wash. `headerHeight` is a `Backdrop` prop only for the scrim.
- `apps/mobile/src/theme/stack-options.tsx`: `BACKDROP_HEADER_OPTIONS`, spread only by the backdrop branch. No screen sets `scrollEdgeEffects`.
- Expo Router's native stack types: `scrollEdgeEffects` is iOS 26 and later only, and every edge defaults to `automatic`.
- `apps/mobile/src/components/title-header.test.tsx`: asserts the exact value of `BACKDROP_HEADER_OPTIONS`.
- `prompts/mobile-look-title-pages.md` (decision 4), `prompts/mobile-title-header-clear-bar.md`, `apps/mobile/AGENTS.md` (the `TitleScroll` bullet, which does not mention the scrim).

## Skills used

`expo-router` (native stack header options), `react-native-testing` (RNTL v14).

## Decisions and assumptions

Agreed with the owner on 2026-11-26:

1. Remove both the app's top gradient and the system top scroll edge effect. Which one reads as the "blur" was not confirmed on a device (agent device access is off), and whether the system effect shows on this screen at all is unknown, so removing both covers either.
2. Mobile only. The web keeps `backdrop-scrim`, which keeps its navbar text at 4.5:1.
3. The bottom wash, the header turning solid with the title on scroll, and the pull to stretch stay.
4. Nothing replaces the gradient. The owner accepts that the status bar, and a back arrow with no background of its own (Android, older iOS), may be hard to see over bright artwork. This is a knowing exception to the contrast the scrim gave, and a separate change if it looks bad.
5. This replaces the top shade that came with decision 4 of `prompts/mobile-look-title-pages.md`.
6. `scrollEdgeEffects: { top: "hidden" }` goes in `BACKDROP_HEADER_OPTIONS`, so only the backdrop branch changes. The other edges keep their default.

## Expected files

- `apps/mobile/src/components/title-header.tsx`: delete `SCRIM_FADE`, `SCRIM_ALPHA`, the scrim view and `Backdrop`'s `headerHeight` prop; update the doc comments.
- `apps/mobile/src/theme/stack-options.tsx`: add the edge option and say why in its comment.
- `apps/mobile/src/components/title-header.test.tsx`: update the expected options.
- `prompts/mobile-backdrop-clear-top.md`

## Requirements

- No gradient or system effect covers the top of a title's backdrop.
- Backdrop height and layout do not change.
- Screens with no backdrop, backdrop screens under Reduce Transparency, tab roots and the web do not change, apart from the gradient already being absent under Reduce Transparency.

## Security considerations

None: presentation only, with no data or auth path.

## Acceptance criteria

- AC-1: on a movie, show and game with a backdrop, the artwork is sharp and unshaded from the screen's top edge.
- AC-2: the bottom wash, the solid header with its title on scroll, and the pull to stretch work as before.
- AC-3: a title with no backdrop, and any title under Reduce Transparency, looks as before.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`. No web route, config or server code changes, so no `pnpm build`.

## Manual test steps

1. iOS 26 simulator or phone: open a movie with a bright backdrop. The top of the artwork is sharp, with no blur or dark veil behind the status bar and back button.
2. Scroll down: the bar turns solid and shows the title. Scroll back up: it clears. Pull down: the artwork stretches.
3. Repeat step 1 on a show and a game.
4. Open a title with no backdrop: the solid header shows, as before.
5. Turn on Reduce Transparency and open a backdrop title: the artwork starts under a solid header.
6. Repeat steps 1 and 2 on an Android emulator.

## As built (2026-11-26)

Both the gradient and the system blur are gone. The owner first chose to keep the blur, then asked for it to go, and approved the resulting layout in the simulator. This replaces decision 6. The page background keeps its gradient and grain.

1. `react-native-screens` finds a screen's scroll view only along each view's first child, and `screenLayout` drew `PageBackground` first. So `movies/[id]`, `shows/[id]` and `games/[id]` are bare in `tabScreenLayout`. `TitleScroll` draws the background inside its scroll view, moved with the offset so it stays still, and `TitleState` draws it behind the loading, not found and error states.
2. Once found, the scroll view is also found by the native tab bar, which turns `never` into `automatic`, but only when the scroll view exists as the screen is pushed (cached data). That opened the page 116pt past its top, zooming the artwork. So the behaviour is `automatic` outright, and `contentInset={{ top: -headerHeight }}` takes the top inset back. The bottom keeps the system's tab bar inset on top of the 96pt padding.
3. `react-native-screens` applies edge effects only when the screen is pushed or the setting changes, and Fabric updates the screen before it inserts new children. So `scrollEdgeEffects.top` stays `automatic` until the scroll view's `onLayout`, then turns `hidden`. It is not in `BACKDROP_HEADER_OPTIONS`.
4. One scroll view serves all three header cases. The header stays transparent in each; with no backdrop, or under Reduce Transparency, it draws the solid colour and the content is padded by the header's height.

Files beyond "Expected files": the tab stack's `_layout.tsx`, the movie, show and game screens, and `apps/mobile/AGENTS.md`. `stack-options.tsx` and the test end up unchanged.

Checked on the iOS 27.2 simulator from a cold launch: a movie, a show and a game open sharp at the top, at the same backdrop height as before. Not checked: scrolling, pull to stretch, push transitions, the loading and error states, a title with no backdrop, Reduce Transparency, a bottom of page scroll, iOS before 26 and Android.

Added manual steps: open a title from Home and watch it slide in (never see through); scroll to the bottom (nothing hidden behind the tab bar, no large empty gap); long press a poster (the preview has a background).
