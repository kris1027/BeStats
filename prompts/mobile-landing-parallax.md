# Mobile landing parallax

## Goal

Give phones (below `md`, 768px) the landing's desktop motion on `/shows`, `/movies` and `/games`, scaled down to fit the screen, while desktop's motion stays the same as today (the hero's layout below `lg` changes too, by decision 12). At the same time, fix the two mobile best practice gaps in the loop: the height it reads changes when the address bar moves, and it keeps running every frame when nothing is moving.

Settled with the owner in a grilling session on 2026-10-31 (Q1 to Q12 below). This supersedes decision 6 of [home-parallax-landing.md](home-parallax-landing.md) and the "below `md` nothing moves" lines of [top-rated-parallax-columns.md](top-rated-parallax-columns.md).

## Inspected

- `components/catalog/landing/landing-parallax.tsx`: one `startMotionLoop` tick. Blobs (half depth below `md`) and the hero run at every width. `if (!isWide) return;` stops the pin, `data-speed`, `data-marquee` and `data-poster-drift`. The loop reads `window.innerHeight` for every position. `onFocusIn` (pin focus scroll) returns below `md`.
- `lib/motion/loop.ts`: `startMotionLoop` calls `requestAnimationFrame` every frame for as long as the page is open. `layout/page-background-motion.tsx` uses it too, and its blobs drift over time, so that loop must keep running continuously.
- `trending-pin.tsx`: the pin, the sticky frame, the clipped track, the "Keep scrolling →" label and the progress bar are all `md:motion-safe:`. The pin is `h-[320vh]`.
- `upcoming-rows.tsx`: `FRAME_CLASS` is a native snap scroller with `md:motion-safe:snap-none md:motion-safe:overflow-x-clip`.
- `popular-grid.tsx` and `landing-skeletons.tsx`: `POPULAR_OFFSETS` are `md:pt-*` only, so a phone gets a plain 2 column grid. `SPEEDS` cycle per card.
- `now-playing-columns.tsx`: `COLUMN_SPEEDS` cycle by `index % 3`, which matches 3 columns but not the phone's 2 (`NOW_GRID_CLASS`).
- `top-rated-list.tsx`: already 2 columns with a phone stagger. `data-speed` is right for 2 columns, and `data-speed-lg` covers 4.
- `landing-parallax.test.tsx`: includes "leaves the speed drift off below md", which this plan inverts.

### Reproduction at 390×844 (Chromium, `/shows`, dev server)

- No horizontal page scroll (`scrollWidth` 390). The background and blob layers reach past the edge but are clipped.
- At scrollY 2500, only `data-depth` and the hero were written. `data-speed`, `data-marquee` and `data-poster-drift` had no inline style, so every section below the hero is static. Trending is a 440px swipe row, not a pin.
- The address bar jitter can't be reproduced in desktop Chromium emulation. It follows from the code: `innerHeight` grows by about 60 to 100px when iOS Safari or Chrome Android hide their toolbars, which moves every centre-of-viewport offset and the pin progress mid-scroll. Checked on a real phone in manual step 6.

## Skills used

- grilling (this session's decisions).
- next-dev-loop, for runtime verification in the running app.

## Decisions

1. **(Q2) Phones get every effect.** The Trending pin, Upcoming marquee, Popular, Now playing and Top rated drift, and poster drift all run at every width. The blobs stay at half depth below `md`.
2. **(Q3) Rows are scroll-driven only with motion allowed.** The `md:motion-safe:` variants on the pin, the progress bar and the row frames become `motion-safe:`, so a phone with motion allowed has no native swipe on Trending or Upcoming. Reduced motion keeps today's native snap rows at every width. Keyboard focus keeps both existing behaviours (the pin scrolls the page to the card, and a marquee row holds the focused card), now at every width.
3. **(Q4) One stable viewport height.** The loop stops reading `innerHeight`. `startMotionLoop` measures a hidden `height: 100svh` probe, re-reads it only on `resize` and `orientationchange`, and passes it to `tick` as `viewport`. The page background loop uses the same value. The pin becomes `h-[220svh] md:h-[320svh]`. On desktop `svh` equals `vh`, so nothing visible changes.
4. **(Q5) The landing loop idles.** `startMotionLoop` gets an opt-in `idle` mode. A frame is requested only after `scroll`, `resize`, `pointermove` (mouse), `focusin`, a mutation under the root (a streamed section arriving), or while the lean is still easing. It stops after a frame where none of those happened and the lean settled within 0.001. The page background does not opt in, because it animates over time. Each tick also does every `getBoundingClientRect` and `scrollWidth` read first, then every style write, so frames don't trigger repeated layouts.
5. **(Q6, Q7, Q8) One width factor, 1 from `md`.** `strength = width >= 768 ? 1 : clamp(width / 1024, 0.3, 1)`, which is about 0.35 at 360px and 0.38 at 390px. It multiplies `data-speed`, `MARQUEE_SPEED` and `POSTER_DRIFT`. The pin pan and progress are proportional to scroll, so they aren't scaled. Fixing the factor at 1 from `md` keeps desktop and tablet exactly as they are (Q7). The jump at 768px falls on the breakpoint where the card sizes and columns already change. The `wide` media query still restarts the loop. The `md` gate leaves the tick, and mouse lean stays `(pointer: fine)` only.
6. **(Q9) Pin length.** 220svh below `md`, which is about 1.2 screens of scroll for the full pan. "Keep scrolling →" stays hidden below `md`, because the header row has no room next to "See all". The progress bar shows at every width with motion allowed.
7. **(Q10) Popular on a phone.** Odd cards get `pt-8` below `md` (`max-md:pt-8` through the `li` class, skeleton too, so the stagger doesn't shift when the cards stream in). Desktop's five step offsets are unchanged, and `SPEEDS` are scaled by the factor.
8. **(Q10) Now playing on a phone.** Each card gets `data-speed-narrow`, ±0.12 by `index % 2`, following the `data-speed-lg` pattern because the column count changes at `md`. The loop reads `data-speed-narrow` below `md`, then `data-speed-lg` from `lg`, then `data-speed`.
9. **(Q10) No overlap.** Measured at 360×740 on `/shows` across the whole scroll: the nearest a drifted card came to the next heading was 41px (Airing today to On the air) and 38px to the footer (Top rated), so no padding changes were needed. Checked during implementation; the original plan expected `pb-24`.
10. **(Q11) Records.** Mark decision 6 of `home-parallax-landing.md` and the "below `md`" lines of `top-rated-parallax-columns.md` superseded on 2026-10-31 by this file. Update the `LandingParallax`, `TrendingPin`, `FRAME_CLASS`, `PopularGrid` and `NowPlayingColumns` JSDoc, the `startMotionLoop` JSDoc and the `components/AGENTS.md` landing line.

11. **Trending fills its pinned screen on a phone (amended 2026-10-31, after owner review).** With the 160px swipe card, the pinned frame held about 400px of content in a 740px screen. Below `md` with motion allowed, the card is `clamp(140px, (100svh - 15rem) * 2/3, 72vw)` wide, so the poster takes the height left after the header, title, gaps and bar, stays narrow enough for the next card to peek in, and stays readable on a landscape phone. The outlined rank grows to 128px to match. `TRENDING_SIZES` becomes `72vw` below `md`. Reduced motion keeps the 160px swipe row, so a reduced motion phone fetches a Trending poster about twice the width it shows; `sizes` cannot read the motion setting, and the poster stays small, so that is accepted. Measured: 360×740 gives a 259px card and 560px of content, 375×667 gives 270px, 390×844 gives 281px, and 740×360 gives 140px, which still fits.

12. **The hero fills a phone's screen with the poster (amended 2026-10-31, owner's choice over a stretched backdrop or keeping the band).** Below `lg`, the hero was a 248px 16:9 band with the title under it and about 210px of empty page. Now the hero is `h-svh` (560px minimum) at every width, with the title block at its foot over a bottom shade. Below `lg` the artwork is the portrait poster (`w780`, TMDB's largest poster rung) covering the hero. From `lg` it is the `original` backdrop in its 16:9 box, as before. One `<picture>` built with `getImageProps` in a small Client Component (`landing/hero-picture.tsx`), because the loader is client-only. The browser fetches only one image: measured at 390px, only `w780` was fetched; at 1440px, only `original`. It loads with `loading="eager"` and `fetchPriority="high"` instead of `preload`, which can't choose between two images. With one image missing, the other serves every width. This supersedes decision 4 of [home-hero-backdrop-quality.md](home-hero-backdrop-quality.md).

13. **Popular is a stacked deck on phones (amended 2026-10-31, owner's choice over a tilt-in grid or a coverflow ring).** Below `md` with motion allowed, the drift and the 32px stagger give way to a deck of pairs:
    - The grid stays two columns. Every card is `sticky` at `top: calc(12svh + row × 10px)`, so a row's two cards stick together and each earlier row peeks 10px above the next. The row comes from an inline `--deck-row` the server writes.
    - Rows sit `24svh` apart in the flow (`gap-y`), so each new pair slides up over the stack after about half a screen of scroll. The 7 rows make the section about 3.8 screens long, against 2.8 today. The grid is the cards' containing block, so the whole stack scrolls away together when the list ends.
    - `LandingParallax` reads, for each row, how far the rows below have covered it (`depth`, the sum of each later row's 0 to 1 cover). It shrinks the row's cards from the top edge to `max(0.82, 1 − 0.06 × depth)` and fades a `bg-background` shade over them to `min(0.6, 0.22 × depth)`. The shade is a `pointer-events-none` overlay, so the cards themselves are never made translucent. All transform and opacity: nothing is laid out again.
    - Focusing a card hidden in the stack scrolls the page to where its row is the front one, the same way the Trending pin does.
    - The cards' `data-speed` drift is 0 below `md` (`data-speed-narrow="0"`), and the skeleton uses the same grid and sticky classes, so nothing moves when the cards stream in.
    - From `md`, and under reduced motion at every width, Popular stays the grid it was: the five-step stagger and drift on desktop, the still two-column grid on a reduced-motion phone. Decision 7's phone stagger is dropped.

## Expected files

- `lib/motion/loop.ts`: stable `viewport` passed to `tick`, and the opt-in `idle` mode (`idle: { watch }`) with its wake events: scroll, resize, mouse move, focus and nodes added under `watch`. A `markActive` hook was planned and dropped, as those events cover every wake.
- `components/catalog/landing/landing-parallax.tsx`: no `md` gate, `strength`, `data-speed-narrow`, read-then-write tick, and `idle: true`.
- `components/layout/page-background-motion.tsx`: uses the passed `viewport` (no `idle`).
- `components/catalog/landing/trending-pin.tsx`, `upcoming-rows.tsx`, `popular-grid.tsx`, `now-playing-columns.tsx`, `top-rated-list.tsx`, `landing-skeletons.tsx`: class changes and the narrow speeds.
- `components/catalog/landing/landing-parallax.test.tsx`, covering the width factor, `data-speed-narrow`, the idle loop and the stable viewport through the component (built this way instead of a separate `lib/motion/loop.test.ts`).
- `prompts/home-parallax-landing.md`, `prompts/top-rated-parallax-columns.md`, `components/AGENTS.md`.

## Requirements and acceptance criteria

- AC-1: At 360 and 390px with motion allowed, the Trending section pins and pans with the bar filling. Upcoming rows slide in opposite directions. Popular, Now playing and Top rated cards drift, and posters drift in their frames.
- AC-2: At 768 and 1440px, the transforms written at the same scroll positions are the same as on `main` (strength 1, same speeds and pin travel). The hero's box is not part of this check: from decision 12 it is `h-svh` at every width, so 768 to 1023px gets the full screen poster hero.
- AC-3: No horizontal page scroll at 360, 390 and 768px on any of the three landings (`documentElement.scrollWidth === innerWidth`).
- AC-4: Under reduced motion at every width, no node is written, Trending and Upcoming are native swipe rows, and nothing pins.
- AC-5: With no scroll, pointer or mutation, the landing loop requests no frames after it settles. The background loop still runs.
- AC-6: Scroll positions are computed from the `100svh` probe: changing `innerHeight` alone does not move any node.
- AC-7: Tabbing through Trending and Upcoming at 390px keeps the focused card in view.
- AC-8: Drifted cards never cover the next section's heading at 360px.
- AC-9: At 390px, Popular stacks in pairs: each new pair slides over the last, the cards underneath shrink, dim and peek, and the stack leaves together at the end of the list with no horizontal overflow. Tabbing to any Popular card brings it to the front. At 768px and above, and under reduced motion, Popular is unchanged.

## Security considerations

None: client-only presentation. No data, request or cache changes, and the landing stays server HTML with one client island.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev`, open `/shows` in a 390×844 responsive viewport, and scroll top to bottom: the hero fades, Trending pins and pans to card 9 with the bar full, then Popular, Airing today, On the air and Top rated all move.
2. Repeat at 360px on `/movies` and `/games`. In the console, `document.documentElement.scrollWidth === innerWidth` is `true` at several scroll points.
3. Tab from the hero into Trending, then into the Upcoming rows: every focused card is fully on screen.
4. Turn on reduced motion (DevTools rendering panel): the page is static and Trending and Upcoming swipe natively.
5. At 1440px, compare with `main` side by side: the same motion.
6. On a real phone (or a tunnel to the dev server), scroll slowly so the address bar hides and shows: nothing jumps.
7. Performance panel at 390px: with the page still for 2s, no `LandingParallax` frames.
