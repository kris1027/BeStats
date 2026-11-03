# Landing hero: no gap between the art and the title block on wide screens

## Goal

The `/movies`, `/shows` and `/games` landing hero has the gap the title pages had (prompts/detail-hero-wide-gap.md): from `lg` the box is a full screen tall while its 16:9 art stops near 918px, so at 2560×1440 the art fades out near 800px and the title block sits around 1000 to 1200px on the plain page. Give it the title pages' fix. Phones and tablets stay as they are.

## Inspected

- `components/catalog/landing/landing-skeletons.tsx`: `HERO_BOX` is `h-svh min-h-[560px] lg:min-h-[620px]`; `HERO_ART_BOX` is `absolute -inset-x-4` plus `HERO_ART_FIT`, so the art is 32px wider than the hero and, from `lg`, `min(56.25vw, 900px) + 18px` tall; `HERO_TEXT_BOX` is `absolute ... bottom-10 ... lg:bottom-[16vh]`. `LandingHeroSkeleton` reuses all three.
- `components/catalog/landing/landing-hero.tsx`: renders the boxes and a centred `Scroll` cue (`data-hero-cue`, `absolute bottom-8`, `lg:block` only).
- `components/catalog/landing/landing-parallax.tsx`: fades `data-hero-cue` with scroll and lists it in `MOVED`.
- No test names `HERO_BOX`, `HERO_TEXT_BOX` or the cue.
- Runtime, `/movies` at 2560×1440: the gap shown above.

## Skills used

None beyond the grilling already done for the title pages; the change is Tailwind classes plus removing one decorative element.

## Decisions (owner, 2026-11-03)

1. **Same rule as the title pages.** From `lg` the hero is as tall as its art: `lg:h-[min(100svh,calc(56.25vw+18px),918px)]`, the `+18px` and `918px` covering the art's 32px bleed, with `lg:min-h-[620px]` kept as the floor.
2. **The title block sits at the art's foot.** `lg:bottom-[16vh]` is dropped, so the phone's `bottom-10` holds at every width, as on the title pages (their decision 6).
3. **The `Scroll` cue is removed**, element and parallax selector both. At `bottom-8` it would sit on the title block's buttons, and with the hero no longer a full screen on wide windows the next section already shows.
4. **Mobile first.** Below `lg` nothing changes.
5. **No hard edge while scrolling (owner, 2026-11-03).** The parallax drifts the art down (`scroll * 0.45`), so its own bottom fade slides under the hero's `overflow-hidden` clip and a hard line shows (seen at 390×844 scrolled 600px, already on `main`). A still wrapper, `HERO_ART_FRAME` (`absolute inset-0 mask-b-from-80%`), fades the hero's foot whatever the art's offset. At rest it only deepens the art's existing fade.

## Expected files

- `components/catalog/landing/landing-skeletons.tsx`: `HERO_BOX` and `HERO_TEXT_BOX` classes and JSDoc.
- `components/catalog/landing/landing-hero.tsx`: the cue element removed; the art box wrapped in `HERO_ART_FRAME` (decision 5).
- `components/catalog/landing/landing-parallax.tsx`: `[data-hero-cue]` removed from `MOVED`, the loop and the JSDoc list.

## Acceptance criteria

- AC-1: At 2560×1440 and 1920×1200 the title block sits on the art's lower part, its foot 40px above the art's bottom edge, with no plain band above it.
- AC-2: At 1440×900 the hero is about 828px tall and the title block is on the art.
- AC-3: At 1024×768 the hero is at least 620px tall and the whole title block is visible.
- AC-4: Below `lg` (390×844, 768×1024) the hero is unchanged.
- AC-5: No `Scroll` cue renders; the hero's parallax (art drift, text rise and fade) still runs.
- AC-6: The skeleton has the same box and title block position.
- AC-7: At 390×844 scrolled 600px, the art fades into the page with no hard line at the hero's foot.

## Security and privacy

None involved: presentational only.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Manual test steps

1. `pnpm dev`, open `/movies` at 2560×1440: the title block sits at the art's foot, no gap, no `Scroll` text.
2. Repeat at 1920×1200 and 1440×900, then `/shows` and `/games`.
3. Scroll slowly: the art drifts and the title rises and fades as before.
4. At 1024×768 the title block is fully visible.
5. At 390×844 the hero looks as before.
6. Throttle to Slow 4G and reload `/movies` at 2560×1440: the skeleton matches and nothing jumps.
