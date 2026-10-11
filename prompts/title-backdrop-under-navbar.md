# Title backdrop under the navbar

Recorded after the fact (2026-10-11). The two commits this plan covers, `fix(hero): fade the backdrop into the film background, not black` and `feat(hero): put the navbar on the title backdrop`, shipped on `feat/film-strip-background` with no plan of their own. A code review flagged them as unspecified scope. This file records what they do and why, so later work has a source to follow.

## Goal

On a movie or show page, the TMDB backdrop should read as the page's own backdrop over the film strip background. It should not sit as a boxed image above a black band.

- The artwork fades into whatever is behind it.
- It reaches up behind the transparent navbar, so the bar sits on the artwork.

## Inspected code

- `components/catalog/detail-hero.tsx`: the backdrop bled to the column edges and up to the navbar with `-mt-8` / `md:-mt-12`, `main`'s own top padding. It faded with three `bg-linear-to-*` overlays from `--background`. Over the new film strip background those overlays painted a black band where the artwork ended.
- `components/catalog/detail-skeletons.tsx`: `DetailHeroSkeleton` mirrors the backdrop's footprint so nothing shifts when it loads.
- `components/layout/navbar.tsx`: transparent, not sticky, with no stacking context of its own. That would have left it under a backdrop pulled up behind it.
- `app/glass-contrast.test.ts`: proves 4.5:1 for every frosted control over the page background's brightest pixel (`PEAK`).

## Skills used

None of the listed skills apply. This is markup and CSS with no data, caching or Supabase surface.

## Decisions

1. **The fade is a mask** (`mask-b-from-67% mask-l-from-67%`, plus `min-[1600px]:mask-r-from-83%` once the column hits its cap). A mask makes the image itself transparent, so it dissolves into the film strips. Overlays could only fade it to a fixed colour. The proportions are the old overlays': the bottom third, the left third, and the right sixth only at the cap.
2. **The backdrop pulls up behind the navbar.** Its top margin is `main`'s padding plus `--navbar-height`. The skeleton uses the same margin, and both get a `min-h` of the bar's height plus 12rem, so a short, wide viewport still shows artwork under the bar.
3. **`--navbar-height` lives in `globals.css`**, written from the bar's parts.
   - On a phone: two 40px rows, an 8px gap and 8px of padding above and below. From `md`: one row.
   - The bar keeps its natural height rather than being fixed to the token, because pages with no tabs have one row on a phone too.
   - `navbar.test.tsx` fails if the bar's padding, gap or direction stop matching the parts.
4. **The navbar is `relative z-20`**, so it paints over the pulled-up backdrop. It stays transparent and not sticky (`components/AGENTS.md`).
5. **`backdrop-scrim` keeps the bar legible.**
   - It holds the artwork at 75% `--background` across the bar's height, then lifts to transparent over the next 8rem.
   - At that shade, even white artwork is no brighter than the page background's `PEAK`, so the bar's text and frosted controls keep the 4.5:1 the glass contrast test proves.
   - That test now checks the scrim's faintest stop across the bar.
6. **Naming.** "Backdrop" names the TMDB artwork (`detail-backdrop`, `backdrop-scrim`, `backdropUrl`), and the page background's utilities and tokens are `page-*` (prompts/film-strip-background.md, As built).

## Files

- `components/catalog/detail-hero.tsx`, `components/catalog/detail-skeletons.tsx`, `components/layout/navbar.tsx`
- `app/globals.css`: `--navbar-height`, `@utility backdrop-scrim`
- `app/glass-contrast.test.ts`, `components/layout/navbar.test.tsx`
- `components/AGENTS.md`: the navbar convention

## Acceptance criteria

- **AC-1:** On `/movies/{id}` and `/shows/{id}` with a backdrop, the artwork fades into the film strip background at the bottom and left with no black band. The right edge fades only at 1600px and wider.
- **AC-2:** The artwork reaches the top of the viewport behind the navbar, at every width, and the loading skeleton has the same footprint.
- **AC-3:** The navbar's text and controls keep 4.5:1 over any artwork behind them (`app/glass-contrast.test.ts`).
- **AC-4:** A title with no backdrop renders as before, and pages without a hero are unchanged.

## Security considerations

None. This is presentation only, with no data, no request state and no new environment value.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev`, open a movie with a bright backdrop at 1440px. The navbar sits on the artwork, which is shaded under the bar and fades into the film strips below and to the left.
2. Resize to 390px. The two-row bar still sits on the artwork, and nothing scrolls horizontally.
3. Widen past 1600px. The right edge fades instead of ending in a hard line.
4. Throttle the network and reload. The skeleton holds the same footprint, and nothing jumps when the image arrives.
5. Open `/privacy`. There is no hero, and the bar is unchanged.
