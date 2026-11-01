# Title page backdrop: the landing hero's size

## Goal

The backdrop on `/movies/{id}`, `/shows/{id}` and `/games/{id}` stops at 70vh and loads a `w1280` file, so on a wide screen it reads as a band rather than the full screen artwork the landing hero shows. Give it the hero's wide screen size, sharpness and fade, and bring the poster and title up onto the first screen. Everything else on the title pages stays as built.

## Inspected

- `components/catalog/detail-hero.tsx`: the backdrop box is `aspect-video max-h-[70vh] min-h-[calc(var(--navbar-height)+12rem)]` with `mask-b-from-67% mask-l-from-67% min-[1600px]:mask-r-from-83%`, an `Image` with `fill preload sizes="(min-width: 1600px) 1600px, 100vw"`, and the `backdrop-scrim`. The poster and title grid overlaps it by `-mt-10 sm:-mt-20 md:-mt-40`. The poster is `w-60` (360px tall) from `md`.
- `components/catalog/detail-skeletons.tsx`: `DetailHeroSkeleton` repeats the box and the overlap.
- `components/catalog/landing/landing-hero.tsx`, `landing-skeletons.tsx`, `hero-picture.tsx`: the hero is `h-svh` (min 560px, 620px from `lg`). From `lg` the art box is `aspect-video lg:max-h-full`; below `lg` it is the portrait poster at full height. Masks `mask-b-from-60% lg:mask-b-from-75% lg:mask-l-from-70% min-[1600px]:mask-r-from-90%`, plus a readability gradient inside the mask. The backdrop is TMDB `original` (prompts/home-hero-backdrop-quality.md, decision 2).
- `lib/tmdb/images.ts`: `BACKDROP_SIZE` is `w1280`. `resizeImageUrl` returns a non TMDB URL (an IGDB `t_1080p` art URL) unchanged.
- `lib/tmdb/image-loader.ts` and `lib/tmdb/AGENTS.md`: both say only the landing hero asks for `original`.
- Callers: `components/movie/movie-hero.tsx`, `app/shows/[id]/page.tsx`, `components/game/game-hero.tsx`. The season page has no backdrop.
- Tests naming the backdrop: `components/movie/movie-hero.test.tsx`, `components/game/game-hero.test.tsx`, `components/show/show-components.test.tsx`, `components/game/game-detail-skeleton.test.tsx`.

## Skills used

`mattpocock-skills:grilling`, for the decisions below. No Next.js, Supabase or database skill applies: the change is presentational plus one image size choice.

## Decisions (settled with the owner on 2026-11-01)

1. **Height.** The box keeps `aspect-video` and drops the 70vh cap for `max-h-svh`, the hero's wide screen rule. On a 16:9 window the art fills the first screen; on an ultrawide one the cap crops it vertically. Not a forced `h-svh`, which would crop every taller window.
2. **Resolution.** The detail hero asks for `resizeImageUrl(backdropUrl, "original")`, as the landing hero does, inside `DetailHero` so every caller gets it. `BACKDROP_SIZE` stays `w1280` for cards and lists. IGDB art stays `t_1080p`, its largest documented size (`resizeImageUrl` passes it through). The loader rule is unchanged: a ladder size up to 1280, the whole `original` past it.
3. **Phones.** The 16:9 backdrop stays below `lg`. No portrait poster art, because the poster tile already sits under it.
4. **Fade.** The hero's masks: `mask-b-from-60% lg:mask-b-from-75% lg:mask-l-from-70% min-[1600px]:mask-r-from-90%`. The `backdrop-scrim` behind the navbar stays.
5. **Motion.** None. The parallax stays on the landing.
6. **Scope.** The shared `DetailHero` and `DetailHeroSkeleton`, so movies, shows and games change together.
7. **Overlap.** From `lg` the poster and title grid overlaps the art by about `lg:-mt-[24rem]`, so the poster's foot sits near the art's faded lower edge and the title is on the first screen. Below `lg` the overlap stays `-mt-10 sm:-mt-20 md:-mt-40`. The exact `lg` value is tuned in the browser at 1024×768, 1440×900 and 1920×1080, and the skeleton uses the same value.
8. **No backdrop.** Unchanged: the poster and title on the flat page, no substitute art.
9. **Minimum height.** Unchanged: `min-h-[calc(var(--navbar-height)+12rem)]`.
10. **Readability.** From `lg` only, the hero's left gradient goes inside the masked box (`lg:bg-linear-to-r lg:from-background/70 lg:via-background/25 lg:via-50% lg:to-transparent`), so it fades out with the image and the title, facts and buttons stay readable over bright art. Nothing is added below `lg`, where the text sits under the short art.

11. **One full screen, like the landing hero (owner, 2026-11-01, after reviewing `/shows/96677`).** At every width the hero is one screen tall (`min-h-[max(100svh,560px)]`, 620px from `lg`), with the poster and title block at its foot (`pb-10`, `lg:pb-[16vh]`) and the Overview below the fold. The art is the landing's `HeroPicture`: the portrait poster (`w780`) below `lg`, the `original` backdrop from it, in the landing's art box (`HERO_ART_BOX` without its parallax bleed). The readability shade is the landing's: from below on a phone, from the left from `lg`. A minimum height rather than a fixed one, so a long title block grows the box instead of being cut. This supersedes decisions 1 (the art box), 3 (phones now show the poster as art, so it shows twice, accepted) and 7 (no overlap; the block sits at the box's foot). Decision 8 holds: with no backdrop the hero keeps its collapsed layout.

12. **Different images (owner, 2026-11-01).** The sizes of decision 11 stay, but the art is the backdrop at every width, so on a phone it never repeats the poster tile. Below `lg` it covers the full screen box cropped to its centre (`object-center`, `object-top` from `lg`), with `sizes` of `178vh` there, the width of a 16:9 image a screen tall. This replaces the `HeroPicture` poster art of decision 11.

13. **Readable over game art (owner, 2026-11-01).** A game's art is often bright and its Platforms line runs across the middle of it. From `lg` the poster and info grid stops at `max-w-5xl` (about the landing hero's `max-w-3xl` text block plus the poster), so long facts wrap inside the shaded side. The shade is stronger, for every media type: from below at every width (`from-background/85 via-background/40`), and from the left from `lg` (`from-background/85 via-background/45 via-45%`, clear by 80%). The landing hero (`landing-hero.tsx`) takes the same two shades, at the owner's request, since its art and genre line have the same problem on `/games`.

14. **Sharper game images (owner, 2026-11-01).** Both game heroes (the `/games` landing hero and `/games/{id}`) look soft. The cause is IGDB's source files, not our size: a larger IGDB size only upscales (`t_1080p_2x` of a 1600px original is the same pixels enlarged). Measured with `t_original`: Witcher 3's artwork is 1200×675, Elden Ring's is a 1920×620 strip that a 16:9 box crops and enlarges, while their screenshots are true 1920×1080; the landing hero on a phone stretches the 528px `t_cover_big_2x` cover to a full screen, though IGDB keeps covers up to 1851×2468.
    - **Pick the sharpest art.** The summary and detail reads also ask for `artworks.width`, `artworks.height`, `screenshots.width` and `screenshots.height`. `artUrl` scores each image by the width it keeps in a 16:9 box, `min(width, height × 16/9)`, and takes the highest; a tie goes to an artwork, then to the lowest `image_id`, so the pick stays stable. An image with no size scores 0, so a game IGDB sends no sizes for keeps today's pick. The URL is still built at `t_1080p`, so the loader ladder and the wide cards are unchanged; cards get the sharper pick too.
    - **Full size cover on phones.** The landing hero's phone art asks for the cover at `t_original` instead of `t_cover_big_2x`, only when IGDB's `cover.width` says the upload is wider than 528px (`GameSummary.fullCoverUrl`, else null, so the hero keeps the 528px cover), since IGDB's sized covers upscale a smaller upload (Witcher 3's is 600×800; Roblox's is 1798×2396, so it gets `t_original`). The IGDB loader treats `t_original` on a cover like the TMDB loader treats `original`: the cover ladder up to 528px, the whole file past it. Only the landing hero builds that URL; every other cover stays `t_cover_big_2x`.
    - Recorded in `lib/igdb/AGENTS.md` beside the existing size rules. `pnpm igdb:live` keeps checking the ladders; `t_original` is not a ladder rung, so it adds no live width check.

15. **Review fixes (2026-11-01, after the two axis review against `main`).**
    - The width cap of decision 13 applies only over art (`DETAIL_TEXT_CAP`), so a title with no backdrop renders exactly as before (AC-6).
    - The two heroes share one module, `components/catalog/hero-frame.tsx`: the bleed (`HERO_BLEED`), the art fit (`HERO_ART_FIT`), the mask (`HERO_ART_MASK`) and the shade (`HeroShade`), so the landing and title page heroes cannot drift apart.
    - Below `lg` the backdrop's `sizes` is `max(100vw, 178vh, 996px)`: the cover crop's width on a landscape tablet and over the 560px floor too, not only a portrait screen. A 3× phone still loads `original`, which decision 12 accepts.
    - The `backdrop-scrim` spans the whole box but fades out 8rem under the navbar, so it never darkens the title block.
    - The IGDB loader serves `t_original` as an unbounded top rung of a cover ladder rather than a second code path; `artUrl` ranks with an `isArtwork` boolean over one `IgdbImage` type; the landing item carries only a game's `fullPosterUrl` and the hero falls back to `posterUrl`.
    - **Firefox carousel fix (commit `0298cf9`).** Not part of this plan: a Firefox reload restored a carousel arrow's enabled state, which fails hydration on the pages these heroes sit on. Kept on this branch as its own `fix(ui)` commit rather than a separate PR; the attribute is now typed as an input's `autoComplete`, so a typo fails the type check.

## Expected files

- `components/catalog/detail-hero.tsx`: the full screen box, the backdrop at every width (decision 12), the masks and the shade; the JSDoc names this plan.
- `components/catalog/hero-frame.tsx`: the bleed, art fit, mask and shade both heroes share (decision 15).
- `components/catalog/detail-skeletons.tsx`: the same boxes, so nothing moves when the hero streams in.
- `lib/tmdb/image-loader.ts` and `lib/tmdb/AGENTS.md`: the `original` exception names the title page backdrop beside the landing hero.
- Decision 14: `lib/igdb/constants.ts` (the four size fields, `IGDB_HERO_COVER_SIZE`), `lib/igdb/schemas.ts` (`width` and `height` on an image), `lib/igdb/normalize.ts` (`artUrl` by size, `fullCoverUrl`), `lib/igdb/types.ts` (`GameSummary.fullCoverUrl`), `components/catalog/landing/landing-items.ts` (`fullPosterUrl`), `lib/images/igdb-loader.ts` (`t_original` on a cover), `components/catalog/landing/landing-hero.tsx` (the phone cover), `lib/igdb/AGENTS.md`, and tests in `lib/igdb/normalize.test.ts` and `lib/images/igdb-loader.test.ts`.
- Tests:
  - `components/movie/movie-hero.test.tsx`: the backdrop `src` uses `/t/p/original/`; the poster is unchanged.
  - `components/game/game-hero.test.tsx`: the IGDB art URL is passed through unchanged.
  - `components/game/game-detail-skeleton.test.tsx`: still finds the backdrop band.

## Requirements and acceptance criteria

- AC-1: At 1440×900 the title page backdrop is drawn about 1440×810 (full width 16:9), not capped at 630px. At 2560×1080 it is capped at the window height. The hero itself is one screen tall at every width (decision 11).
- AC-2: At 1× DPR wider than 1280px, and on a 2× screen wider than 640 CSS px, a movie or show backdrop loads `/t/p/original/...`; narrower, it loads `w1280` or smaller. A game's art still loads its IGDB URL.
- AC-3: From `lg` the title is visible without scrolling at 1024×768, 1440×900 and 1920×1080, and reads clearly over bright artwork.
- AC-4: Below `lg` the hero fills the screen with the backdrop, cropped to its centre, as art and the title block at its foot (decisions 11 and 12).
- AC-5: The skeleton and the loaded hero have the same box and overlap at every width.
- AC-6: A title with no backdrop renders exactly as before.
- AC-7: Cards, lists, the season page and the landing are unchanged, apart from the shade (decision 13) and the game images (decision 14).
- AC-8: `/games/1942` and `/games/119133` show a true 1920×1080 image (a screenshot) as the hero art, and a game whose artwork is the largest still shows its artwork. With no sizes from IGDB, the pick is today's.
- AC-9: On a phone, the `/games` landing hero loads its cover from `t_original`; on desktop it still loads the art.

## Security and privacy

No user data, request state or credentials are involved. The image hosts stay `image.tmdb.org` and IGDB's. The `original` path is built from a URL `lib/tmdb` already produced.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. Run `pnpm dev` and open a movie with a backdrop (for example `/movies/550`) at 1440×900. Check that the art fills the first screen, sharp, fading at the bottom and left like the `/movies` hero, and that the poster and title sit on its lower part.
2. In DevTools Network, filter `image.tmdb.org`. Check that the backdrop request is `/t/p/original/...` and the poster `w500` or smaller.
3. Repeat at 1024×768, 1920×1080 and 2560×1080. Check that the title is on the first screen and readable, and that no image edge shows.
4. Set the viewport to 390×844 and 768×1024. Check that the hero fills the screen with the backdrop (not the poster) as art, the title block at its foot, and the Overview below the fold.
5. Throttle to Slow 4G and reload. Check that the skeleton has the same shape and nothing jumps.
6. Open a show (`/shows/1399`) and a game with art. Check the same layout, and that the game's art request is its IGDB URL.
7. Open a title with no backdrop. Check that it renders as before.
8. Open `/showcase` and check that the detail hero skeleton matches.
9. Open `/games/1942` and `/games/119133` at 1440×900. Check that the art is sharp, and in Network that it is a screenshot id (`sc…`) at `t_1080p`.
10. Open `/games` at 375×812. Check in Network that a game whose cover upload is wider than 528px loads `t_original/co….jpg`, (Roblox, 1798px), and that a cover whose upload is 528px or narrower keeps `t_cover_big_2x`.
