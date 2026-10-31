# Landing hero backdrop: size and sharpness

## Goal

The landing hero on `/movies` and `/shows` (prompts/home-parallax-landing.md, decision 4) shows its backdrop far larger than the image is, and blurry. Draw it at about its own 16:9 shape, and load a source sharp enough for the width it fills. Everything else on the landing stays as built.

## Inspected

- `components/catalog/landing/landing-hero.tsx`: the image layer is `absolute inset-x-0 -inset-y-[10%]`, which is 120% of a hero that is `h-svh min-h-[620px]` (`HERO_BOX`). It uses `object-cover object-top` and `sizes="(min-width: 1600px) 1600px, 100vw"`.
- `components/catalog/landing/landing-parallax.tsx:132-136`: `[data-hero-bg]` gets `translate3d(-easedX * 14px, scroll * 0.45px, 0) scale(1 + progress * 0.12)`.
- `components/catalog/landing/landing-skeletons.tsx`: `HERO_BOX` and `LandingHeroSkeleton`, which `/showcase` imports.
- `lib/tmdb/images.ts`: `BACKDROP_SIZE` is `w1280`, and `TMDB_IMAGE_WIDTHS` tops out at 1280.
- `lib/tmdb/image-loader.ts`: an `original` source is capped at 1280 (`ORIGINAL_CEILING`). Nothing in the app passes `original` today; only `image-loader.test.ts` and `surface.test.ts` name it.
- `components/catalog/detail-hero.tsx`: the title page backdrop is `aspect-video max-h-[70vh]` and looks right. It is out of scope here.

### Why it looks wrong

The numbers below are for a 1440×900 viewport.

- The layer is 1440×1080. `object-cover` on a 16:9 image fills that at about 1920×1080, and the scroll zoom takes it to about 2150px wide. About a quarter of the width is cropped off, and the subject is shown far larger than intended.
- The source is a 1280px file, so it is stretched about 1.7× at 1× DPR and about 3.4× on a 2× screen.
- On a 390×844 phone, the layer is about 1013px tall. Cover makes the image about 1800px wide, so the visible part is about 22% of its width.

## Skills used

`mattpocock-skills:grilling`, for the decisions below. No Next.js, Supabase or database skill applies, because the change is presentational plus one loader rule.

## Decisions (settled with the owner on 2026-10-18)

1. **Image box.** The hero stays full screen from `lg`. The backdrop sits in a box at full width with `aspect-video`, capped at the hero's height (`max-h-full`), anchored to the top, and still `object-cover object-top`. On a 16:10 or squarer window, the whole image shows. On an ultrawide screen, it is cropped vertically only by the cap.
   - The 120% vertical overscan is removed.
   - A 16px horizontal bleed (`-inset-x-4`) is kept so the ±14px pointer drift never shows an edge.
   - The existing masks fade the image into the page: bottom, left, and right from 1600px.
   - The title block keeps its place at `bottom-[16vh]` over the lower part of the image.
2. **Sharper source, hero only.** The hero asks for TMDB's `original` backdrop: `resizeImageUrl(item.backdropUrl, "original")`, with the poster fallback unchanged.
   - The loader rule changes to this: an `original` source is used as is when the requested width is over 1280, and otherwise follows the ladder as now. So 1× at 1280 or narrower still gets `w1280` or smaller.
   - This is a recorded exception to "never `original`" in `lib/tmdb/AGENTS.md`. `BACKDROP_SIZE` stays `w1280`, so every other surface is unchanged.
   - Cost: one preloaded image per landing visit, usually 1920×1080, sometimes 4K. The cost is about 0.3–1.5 MB from TMDB's CDN, and no Vercel transformation.
3. **No scroll zoom.** `scale(...)` is removed from the `[data-hero-bg]` transform. The vertical drift (`scroll * 0.45`) and pointer drift stay, and reduced motion is unchanged.
4. **Phones and portrait tablets (below `lg`).** The hero is not full height. The backdrop is a 16:9 band at the top, pulled up behind the navbar as now, and the title block flows below it over the faded page. The Scroll cue is hidden there.
   - **Assumption:** this uses `lg`, not `md`, because a 768×1024 portrait tablet has the same problem as a phone.
   - Superseded on 2026-10-31 by prompts/mobile-landing-parallax.md, decision 12: below `lg` the hero is full height with the portrait poster, and the backdrop shows from `lg` only.
5. **Scope.** Only the landing hero changes. Applying the same rule to `DetailHero` is a possible follow-up.

## Expected files

- `components/catalog/landing/landing-hero.tsx`: the new image box, the `original` source, and the layout below `lg`.
- `components/catalog/landing/landing-skeletons.tsx`: `HERO_BOX` and the skeleton follow the same two layouts, so nothing moves when the hero streams in. `/showcase` then shows the new shape without an edit of its own.
- `components/catalog/landing/landing-parallax.tsx`: the scale is dropped.
- `lib/tmdb/image-loader.ts`: the `original` rule.
- Tests:
  - `lib/tmdb/image-loader.test.ts`: `original` at width 3840 is returned as is; at 128 it gets the ladder size; at 1280 it gets `w1280`.
  - `components/catalog/landing/landing-hero.test.tsx`: the hero `src` uses `original`, and the poster fallback is unchanged.
  - `components/catalog/landing/landing-parallax.test.tsx`: the hero background transform has no `scale`.
- Docs:
  - `lib/tmdb/AGENTS.md`: the image line names the hero exception.
  - `prompts/home-parallax-landing.md`: decision 10's "100svh" line and the "drifts and zooms" test step point here.

## Requirements and acceptance criteria

- AC-1: At 1440×900, the hero image is drawn about 1440×810 (16:9, plus the 16px bleed), with no vertical overscan and no zoom while scrolling.
- AC-2: At 1× DPR and a viewport wider than 1280, and at any width on a 2× screen over 640 CSS px, the hero loads `/t/p/original/...`. At 1× and 1280 or narrower, it loads `w1280` or a smaller size.
- AC-3: Every other TMDB image request (posters, the title page backdrop, the Upcoming cards) is unchanged.
- AC-4: Below `lg`, the backdrop is a 16:9 band and the title, chips and buttons sit below it, readable, with no empty full-height gap.
- AC-5: The skeleton and the loaded hero have the same box at every width, so nothing below the hero moves when it arrives.
- AC-6: The pointer drift never shows an edge of the image. Reduced motion still sets every transform to identity.
- AC-7: When there is no backdrop, the poster fallback and the missing-image plate still work.

## Security and privacy

No user data, request state or credentials are involved. The image host stays `image.tmdb.org`. The `original` path is built from a TMDB URL that `lib/tmdb` already produced, and the loader still returns unknown URLs unchanged.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. Run `pnpm dev`, then open `/movies` at 1440×900. Check that the backdrop shows the whole width of the image, sharp, fading into the page at the bottom and left.
2. In DevTools Network, filter `image.tmdb.org`. Check that the hero request is `/t/p/original/...` and the posters are `w342` or `w500`.
3. Scroll slowly. Check that the backdrop drifts but does not grow, and that the title fades.
4. Move the mouse to each edge. Check that no image edge or gap shows.
5. Set the viewport to 390×844 and 768×1024. Check the 16:9 band at the top, the title block directly below it, and no large empty area.
6. Throttle to Slow 4G and reload. Check that the skeleton has the same shape as the loaded hero and nothing jumps.
7. Repeat on `/shows`.
8. Turn on reduced motion and reload. Check that the image is static and correctly placed.
9. Open `/showcase` and check that the hero skeleton matches the new shape.
