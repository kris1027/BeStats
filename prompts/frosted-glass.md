# Frosted glass surfaces

## Goal

Make the backgrounds of buttons, button-style links, controls, panels and overlays read as glass. The animated film-strip background ([prompts/film-strip-background.md](film-strip-background.md)) should show through each surface as soft, blurred colour.

Every text colour must still meet WCAG AA, checked against the worst pixel that can sit behind the surface. This goal comes from the owner's request on 2026-10-11, and the decisions below were settled in grilling the same day.

## Inspected code

- **`app/globals.css`**
  - The four plate tokens are opaque: `--color-glass-plate` `#101416`, `-panel` `#08090c`, `-sheet` `#090a0d` and `-score` `#0c1419`.
  - The `glass`, `glass-selected`, `glass-selected-personal` and `plate-rim` utilities paint the glass gradient, then the plate, then the rim. The plate comes from `--glass-plate`, which the `glass-plate*` utilities set.
  - `--blur-glass` is 16px.
  - The glass gradient's brightest stop is `rgb(255 255 255 / 0.18)`. In the contrast math below this "sheen" costs more contrast than the plate does.
  - `--destructive` `#fb8a8a` was tuned to reach 4.67:1 over the opaque control plate.
- **`lib/film-scene/palette.ts`**: `peakLuminance()` caps every background pixel at the luminance where `--muted-foreground` `#a8adbc` keeps 4.5:1. The ceiling is 0.0541, which equals a grey of `#424242`.
- **[components/AGENTS.md](../components/AGENTS.md)**: the plate rule, the "blur only on surfaces that overlap content" rule, and the touch and focus rules.
- **Plate users**, about 25 files:
  - `ui/button.tsx`, `ui/card.tsx`, `ui/toggle-group.tsx`, `ui/popover.tsx`, `ui/sonner.tsx` and `ui/dialog.tsx`.
  - `glass-pill.tsx`, `state-panel.tsx` and `skeleton.tsx`.
  - `layout/media-type-tabs.tsx`, `layout/library-nav.tsx` and `layout/mobile-menu-sheet.tsx`.
  - `search/navbar-search.tsx`, `search/quick-search.tsx`, `search/quick-search-row.tsx` and `search/filter-bar.tsx`.
  - `tracking/score-picker.tsx` and `tracking/card-round-button.tsx`, plus the tracking controls that use `glassPillClassName()`.
  - `library/dated-pill.tsx` and `library/watchlist-show-controls.tsx`.
  - `auth/auth-panel.tsx`, `app/account/page.tsx` and `poster-card.tsx`.
- **Missing poster tiles** (`poster-card`, `episode-row`, `season-header`, `cast-row` and `detail-hero`) use `bg-glass-plate`, which is the colour token itself, not the utility.
- **The dialog and the mobile menu sheet** sit over a `bg-background/60` backdrop with blur. The popover, toasts and quick search dropdown have no such backdrop.

## Skills used

- `next-dev-loop`, to check the running app and the visuals.
- `next-cache-components-optimizer` guidance, only to confirm that the shell stays prerendered. The change is CSS and class names only, so no route should move.
- No Supabase skill: there is no data change.

## Decisions (grilling, 2026-10-11)

1. **Frosted glass.** The plates become see-through, and every see-through plate also blurs what is behind it. Blur without a plate, or a plate without blur, never ships.
2. **Scope.**
   - **Controls become frosted:** buttons, toggles, navbar tabs, library nav, the search field, filter pills, the score picker and tracking pills.
   - **Panels become frosted:** cards, the state panel, the auth panel, account sections and season header surfaces.
   - **Overlays become frosted:** the dialog, mobile menu sheet, popover, toasts and quick search.
   - **These stay solid:** everything drawn over poster artwork. That covers the poster card badge and control slots, and whatever they render: rating pills, round buttons, dated pills and watchlist controls.
   - **These also stay solid:** missing poster tiles and skeletons. They stand in for artwork and should read as an empty space.
   - `GlassPill` away from posters (the movie hero, show meta and tracking pills) becomes frosted.
3. **AA holds.** Every text colour used on a surface must keep at least 4.5:1 over that surface at its brightest gradient stop, composited over the worst pixel that can sit behind it (method below).
4. **Links.** Only links drawn as buttons or pills change: `ButtonLink`, the navbar and library links, pagination and retry. Plain text links stay as they are.
5. **Fallbacks restore today's opaque plates with no blur** in three cases:
   - `@media (prefers-reduced-transparency: reduce)`
   - `@media (prefers-contrast: more)`
   - `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`

   All three live in `globals.css` only.
6. **Blur is built into the plate utilities**, from new tokens: `--blur-control` 12px, `--blur-panel` 20px and `--blur-overlay` 24px. There is no saturation boost. The existing `--blur-glass` 16px stays for the poster badges and the dialog backdrop.
7. **Nesting.** Only the outermost large surface frosts. A panel inside a panel, or a highlighted row inside the quick search panel, gets no plate or blur of its own.
   - Small controls inside a panel (buttons in the auth panel, pills in an episode row) keep their frosted plate. Blur cost grows with area, and these are small.
   - The Chrome performance trace (checks below) is what confirms this choice.
8. **States.**
   - Hover stays `brightness-125` (`110` on selected).
   - Selected surfaces (`glass-selected`, `glass-selected-personal`) keep an opaque plate. A 60% plate under the selected gradient drops near white text to about 4.1:1 at the peak pixel. Keeping it solid also widens the contrast between selected and unselected from about 2.1:1 today to about 2.6:1, so a selected surface stands out more than it does now.
   - No new pressed state.
9. **Softer sheen (owner choice).** The glass gradient's top stop drops from 18% to 12% white, and its other two stops scale by the same factor of two thirds.
   - With the 18% sheen, AA for muted and destructive text holds only with plates of about 90% opacity, which would barely change the look.
   - With 12%, plates can drop to about 60%.
   - `glass-selected` keeps its own brighter gradient.
10. **Branch.** All work goes on the current branch, `feat/film-strip-background` (owner). There is no separate PR or branch.

### Contrast method and starting values

Composite in sRGB the way browsers blend, top layer first: sheen over plate (at its opacity) over the worst background, then measure each text token against the result.

| Plate role | Utility | Used by | Worst background behind it | Minimum by estimate | Proposed |
| --- | --- | --- | --- | --- | --- |
| Control | `glass-plate` | buttons, pills, tabs, fields, filters | `#424242`, the background's luminance cap | 61% | **65%** |
| Panel | `glass-plate-panel` | cards, state panel, auth panel, account | `#424242` | 50% | **60%** |
| Sheet | `glass-plate-sheet` | dialog, mobile menu sheet | white under the 60% black backdrop | 70% | **75%** |
| Float (new) | `glass-plate-float` | popover, quick search panel, toasts | white, since a float can land on a poster | 89% | **90%** |
| Score | `glass-plate-score` | score picker selected, score pill | `#424242` | set by the test | **65%** or higher |

The estimate checked muted `#a8adbc` and destructive `#fb8a8a`, the two weakest colours. The test fixes the final values. Each plate takes the lowest value from 5% steps that passes, and is never below the proposed value.

Toasts move from the sheet plate to the float plate, because they have no backdrop.

### Mechanism (all in `globals.css`)

- **The opaque colour tokens stay as they are.** `bg-glass-plate` tiles and fallbacks use them.
- **New opacity tokens:** `--frost-control`, `--frost-panel`, `--frost-sheet`, `--frost-float` and `--frost-score`. Each `glass-plate*` utility sets `--glass-plate: color-mix(in srgb, <token> var(--frost-*), transparent)` and its blur. It sets both `backdrop-filter` and `-webkit-backdrop-filter`, because Safari still needs the prefix.
- **New `plate-solid` utility.** It sets every `--frost-*` to 100% and the blur to none, on the element and, through inheritance, on everything inside it. It goes on:
  - the poster card's badge and control slots
  - any library card slot laid over a poster
  - the skeleton and quick search placeholder tiles

  There is no per-component plate switch: the slot decides.
- **Selected utilities** read a solid plate variable (`--glass-plate-solid`), which the plate utilities set next to `--glass-plate`.
- **Fallbacks.** The three fallback blocks override every `--frost-*` to 100% and the blur to none on `:root`.

## Expected files

- `app/globals.css`: the sheen, the frost and blur tokens, the plate utilities, `glass-plate-float`, `plate-solid`, the selected utilities' solid plate, the fallbacks, and comment updates (including the `--destructive` and `glass-selected-personal` contrast figures).
- `components/ui/popover.tsx`, `components/search/quick-search.tsx` and `components/ui/sonner.tsx`: move to `glass-plate-float`. The quick search popup drops its separate `backdrop-blur-glass`.
- `components/poster-card.tsx`, `components/skeleton.tsx`, `components/search/quick-search-row.tsx`, and any library card slot over a poster: add `plate-solid`.
- `components/search/quick-search.tsx`: the highlighted row stays gradient and rim only. Check every other nested surface found while implementing.
- `app/showcase/page.tsx`: the plate rule section shows frosted, solid (over a poster) and fallback side by side, plus the frost scale.
- `app/glass-contrast.test.ts` (new): reads the tokens and the sheen from `globals.css`, composites them as above, and fails on any text-on-surface pair below 4.5:1 or any frost token below its minimum.
- `components/AGENTS.md`: rewrite the plate rule and the blur rule, and add `plate-solid` and the float plate.
- Root `AGENTS.md`: no change expected.

## Requirements and acceptance criteria

1. Controls, panels and overlays show the moving background through them as blurred colour on `/shows`, `/movies`, a title page, `/search`, the library pages, `/sign-in` and `/account`.
2. Every badge, pill and round button on a poster looks exactly as it does today, and so do missing poster tiles and skeletons.
3. `glass-contrast.test.ts` passes. Every text token used on a frosted surface keeps at least 4.5:1 at its worst background, and `text-on-personal` on the selected tab keeps at least 4.5:1.
4. With reduced transparency or more contrast turned on (DevTools emulation), or with no `backdrop-filter`, every surface renders as it does today apart from the softer sheen.
5. Selected surfaces stay at least as distinct from unselected ones as they are today.
6. Focus rings, 44px touch targets and the 40px navbar heights are unchanged.
7. No colour literal appears outside `globals.css`, and `design-tokens-boundary.test.ts` passes.
8. A trace of a long season page and of `/shows` shows no long frames caused by backdrop filters while the background animates (desktop, no CPU throttle).
9. `/shows`, `/movies` and `/movies/[id]` keep their prerendered shells (the build output is unchanged).

## Security considerations

None of substance. The change is CSS and class names only, with no data, auth or caching change. No secrets are touched.

## Risks

- `backdrop-filter` makes an element a containing block for `position: fixed` children and starts a stacking context. Base UI portals its popups, but I'll grep for fixed children inside plated elements and check the `hit-area` pseudo-elements.
- Blur cost over the WebGL canvas. Mitigations: the nesting rule, solid slots on poster grids, and a trace before finishing.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (including the new contrast test) and `pnpm build`.

## Manual test steps

1. Run `pnpm dev` and open `/shows`. The navbar tabs, search field and buttons show the teal film strips moving behind them, blurred. Poster badges and round buttons look unchanged.
2. Open a show and a season with many episodes. The tracking pills and score pill are frosted, and the text is readable over the brightest bokeh. In DevTools Performance, record 5 seconds while scrolling: there should be no long frames.
3. Open the score picker popover and the quick search dropdown over the poster grid. Both stay readable over a white poster.
4. Open the mobile menu (narrow window) and a dialog. The sheet is frosted over the dimmed page.
5. Visit `/sign-in` and `/account`. The panels are frosted, and the submit button, which is selected, is clearly brighter.
6. In DevTools Rendering, emulate `prefers-reduced-transparency: reduce`, then `prefers-contrast: more`. The surfaces turn solid again.
7. Tab through the navbar and a panel. The focus ring is visible on each frosted surface.
8. Open `/showcase` and check the plate rule section.
