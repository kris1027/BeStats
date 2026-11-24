# Mobile: Home and card titles at the largest text size

## Goal

At the iOS accessibility text sizes, Home's section titles and the poster cards' titles break mid-word ("Trendi / ng / this / week", "Blac / k…"). Make both wrap at word boundaries and stay readable, with the default text size unchanged (AGENTS.md section 3: every view works at phone width; apps/mobile/AGENTS.md, Styling). Found in the Search slice's Simulator pass ([mobile-look-search.md](mobile-look-search.md), 2026-11-24).

## Inspected code

- `apps/mobile/src/components/landing-section.tsx`: each Home section's header is one row, the title block (`flex-1`: kicker, `text-xl` title, blurb) beside a `See all` link. At AX5 (font scale about 3.1) `See all` alone takes most of the 402pt width, leaving the title a narrow column, so "Trending" breaks inside the word.
- `apps/mobile/src/components/poster-card.tsx`: the title (`text-sm`, 2 lines) and year sit under the poster at the card's width: 112pt or 150pt in Home's rows, about 118pt in the three column grids (`grid-layout.ts`). At AX5 `text-sm` is about 43pt, wider than many words fit in 118pt.
- `apps/mobile/src/components/text.tsx` and `src/theme/pill.ts`: text keeps system scaling; only fixed height controls cap it (`PILL_FONT_SCALE_CAP` = 1.4 with `maxFontSizeMultiplier`).

## Skills used

`expo-design-system` (tokens and shared constants, no new colour), `react-native-testing` (RNTL v14).

## Decisions

1. **Home's section header stacks at accessibility sizes.** When `useWindowDimensions().fontScale` is above 1.35 (iOS's largest standard size, XXXL; every accessibility size is above it), the header becomes a column: the title block at full width, then `See all` under it, left aligned. At standard sizes the row is unchanged. The test is a pure `isAccessibilityTextSize(fontScale)` in `src/theme/font-scale.ts`, so later screens use the same line.
2. **Card text caps its scaling at 1.35, the largest standard size.** The card's width is fixed by its poster, so its title and year behave like a fixed width control: no text size can make a long word fit 118pt at 3×. Title and year take `maxFontSizeMultiplier={CARD_FONT_SCALE_CAP}` (in `src/theme/font-scale.ts`), which still grows them a third (`text-sm` to about 19pt) while a long title word fits the column. Built at 1.5 first; the Simulator showed "Supernatural" breaking as "Supernatura / l" in a 118pt column, so the cap is the largest standard size: card text never takes an accessibility size. This widens the Styling rule "cap only on fixed height controls" to "fixed height or fixed width"; `apps/mobile/AGENTS.md` records it.
3. **Rejected: two grid columns at accessibility sizes.** It would help Search and list grids but not Home's fixed width rows, and it changes the grid's skeleton and paging shape; decision 2 covers every card at once.

## Assumptions

- React Native wraps at word boundaries when every word fits the line; with the cap, a single word longer than the column (rare titles like "Programmable") can still break inside, which the platform does too.
- `fontScale` follows the system setting live (`useWindowDimensions` updates on change), so no restart is needed.

## Expected files

New: `apps/mobile/src/theme/font-scale.ts` and its test.
Changed: `components/landing-section.tsx`, `components/poster-card.tsx`, `apps/mobile/AGENTS.md` (Styling), this plan.

## Requirements

1. At standard text sizes, Home and the cards look exactly as today.
2. At every accessibility size, Home's section titles wrap only between words, with `See all` below the title and still a 44pt target.
3. Card titles and years scale up to 1.35× and wrap between words; titles stay at 2 lines with an ellipsis.
4. No colour literal, no new token; the boundary tests keep passing.

## Security considerations

None: layout only, no data, input or network change.

## Acceptance criteria

- **AC-1**: At AX5 in the iOS Simulator, Home's "Trending this week" reads on whole words with `See all` under it.
- **AC-2**: At AX5, Search's grid and Home's rows show card titles broken only between words for ordinary titles.
- **AC-3**: At the default size, Home and Search match the screenshots from before the change.
- **AC-4**: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.

## Automated checks

`font-scale.test.ts` (the threshold at 1.35 and the cap value); a `landing-section` render test that the header stacks when `fontScale` is above the threshold; `pnpm typecheck`, `pnpm lint`, `pnpm test`. No route or server change, so no `pnpm build`.

## Manual test steps

1. `orb start`, `pnpm exec supabase start`, `pnpm dev:docker`; from `apps/mobile`, `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 npx expo start --dev-client`.
2. `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`. Open Home: section titles on whole words, `See all` below. Scroll a row: card titles on whole words.
3. Open Search: grid titles on whole words.
4. `xcrun simctl ui booted content_size large`: Home and Search look as before.

## Result (2026-11-24)

Checked in the iOS Simulator (iPhone 18 Pro, local stack, signed out). At AX5: Home's "Trending this week" reads on whole words with See all under it; Home's rows and Search's grid show card titles on whole words, "Supernatural" included once the cap was the largest standard size. At the default size Home and Search match the earlier screenshots. A Jest render test reads the header's class, since NativeWind classes are not compiled to styles under Jest.

## Branch

On `feat/mobile-look-search` as its own commits, since that branch is not pushed yet and already holds the card title width fix from the same Simulator pass.
