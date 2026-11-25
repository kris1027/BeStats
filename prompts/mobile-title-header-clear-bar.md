# Mobile title header: clear bar over the backdrop (feat/mobile-title-header-inset)

## Goal

On movie, show and game screens with a backdrop, an opaque band covered the top of the artwork. The header was transparent (`headerTransparent: true`), but the native header still painted the solid `headerStyle` colour that every stack gets from `STACK_SCREEN_OPTIONS`. Clear that colour over a backdrop so the artwork runs full bleed under a clear bar and only `HeaderFade` draws the solid colour as it scrolls under (prompts/mobile-look-title-pages.md, decision 4 and AC-1). This is a regression fix within that plan's scope; no new behaviour.

## Inspected code

- `apps/mobile/src/components/title-header.tsx`: `TitleScroll`'s three branches (backdrop, backdrop under Reduce Transparency, no backdrop), `HeaderOptions`, `HeaderFade`.
- `apps/mobile/src/theme/stack-options.tsx`: `STACK_SCREEN_OPTIONS`, `HEADER_BACKGROUND`, `largeTitleScreenOptions` (which already overrides the stack colour for large titles).
- `apps/mobile/src/components/title-header.test.tsx`.

## Skills used

`react-native-testing` (RNTL v14), `expo-router` (native stack header options).

## Decisions and assumptions

1. `BACKDROP_HEADER_OPTIONS` (`headerTransparent: true`, `headerStyle.backgroundColor: "transparent"`) lives in `stack-options.tsx` beside `STACK_SCREEN_OPTIONS`, whose colour it undoes, so the knowledge of what the stack default paints stays in one module. `TitleScroll` spreads it in its backdrop branch only.
2. The no-backdrop and Reduce Transparency branches keep the stack's solid header unchanged (decision 4, requirement 6).
3. `"transparent"` is a keyword, not a colour value, so the token boundary allows it; `stack-options.tsx` already uses it.

Raised by the two-axis review on 2026-11-25; the user asked to fix its three judgement calls (this plan, the shared options, a tighter test), which waives the separate plan approval for this scope.

## Expected files

- `apps/mobile/src/theme/stack-options.tsx`
- `apps/mobile/src/components/title-header.tsx`
- `apps/mobile/src/components/title-header.test.tsx`
- `prompts/mobile-title-header-clear-bar.md`

## Requirements

- Over a backdrop, the native header paints no colour of its own until `HeaderFade` fades in.
- No other header (no backdrop, Reduce Transparency, tab roots, other stacks) changes.

## Security considerations

None: a styling option, no data or auth path.

## Acceptance criteria

- AC-1: a title with a backdrop shows the artwork from the screen's top edge under a clear bar; scrolling turns the bar solid with the title.
- AC-2: a title with no backdrop, and any title under Reduce Transparency, keeps the solid header.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (the `title-header.test.tsx` case asserts the backdrop branch passes `BACKDROP_HEADER_OPTIONS` to `Stack.Screen`).

## Manual test steps

1. iOS 26 simulator: open a movie with a backdrop. The artwork starts at the very top of the screen with no band under the status bar or back button.
2. Scroll down: the bar fades to solid and the title appears; scroll back up: it clears again.
3. Open a title with no backdrop: the solid header shows, as before.
4. Turn on Reduce Transparency: a backdrop title starts under a solid header.
5. Repeat steps 1 and 2 on an Android emulator.
