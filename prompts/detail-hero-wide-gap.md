# Title page hero: no gap between the art and the poster on wide screens

## Goal

On `/movies/{id}`, `/shows/{id}` and `/games/{id}`, a wide or tall window (about 1920px and up, or any window taller than the art) shows the backdrop fading out above the poster and title block, with an empty band between them. At 2560×1440 the art ends near 900px and the poster starts near 850px, under the fade. Keep the poster and title on the lower part of the art at every width. Phones and tablets stay as they are.

## Inspected

- `components/catalog/detail-hero.tsx`: `DETAIL_HERO_BOX` is `min-h-[max(100svh,560px)] ... pb-10 ... lg:min-h-[max(100svh,620px)] lg:pb-[16vh]`, with the poster and title block at its foot (`justify-end`). `DETAIL_ART_BOX` uses `HERO_ART_FIT`.
- `components/catalog/hero-frame.tsx`: `HERO_ART_FIT` is `h-full` below `lg`, and from `lg` `h-auto aspect-video max-h-full` at the hero's width. `HERO_BLEED` cancels `main`'s `px-4`, so the hero is as wide as `main`: the window, capped at 1600px (`app/layout.tsx`, `max-w-[1600px]`).
- `components/catalog/detail-skeletons.tsx`: `DetailHeroSkeleton` reuses `DETAIL_HERO_BOX`, so it follows any change to it.
- `prompts/detail-backdrop-hero-size.md`: decision 11 made the hero one screen tall at every width; decisions 12 and 13 set the phone crop and the shade.
- Runtime, `/movies/550` with `pnpm dev`: 390×844, 768×1024 and 1440×900 put the poster on the art; 1920×1200 shows a small gap; 2560×1440 shows the full gap.
- `/movies` at 2560×1440: the landing hero has the same gap (art fades near 800px, title block near 1000 to 1200px). Out of scope here, see Follow-up.

The cause: from `lg` the art is 16:9 of the hero's width, at most 900px tall (1600 × 9/16), while the hero is a full screen tall with the block pinned to its foot. Once the screen is taller than the art, the block slides below it.

## Skills used

`mattpocock-skills:grilling` (via `grill-me`), for the decisions below. No Next.js, Supabase or database skill applies: the change is one Tailwind class string.

## Decisions (settled with the owner on 2026-11-03)

1. **The gap is the wide screen one.** Phones (390×844), tablets (768×1024) and 1440×900 already put the poster on the art.
2. **The hero is as tall as the art from `lg` (option A).** Its minimum height from `lg` becomes `max(min(100svh, 56.25vw, 900px), 620px)`: the screen, the art's 16:9 height, or the art's 900px cap, whichever is smallest, never under 620px. Rejected: covering the full screen with the art past 1600px (crops and enlarges the backdrop where sharpness shows most), and more bottom padding (a magic number that breaks at the next size). This supersedes decision 11 of `prompts/detail-backdrop-hero-size.md` from `lg`; below `lg` decision 11 holds.
3. **Mobile first.** The phone hero is untouched: the base classes stay the phone's, and only the `lg:` value changes. Spacing below the hero (`gap-10 md:gap-14`) is unchanged.
4. **Same fix everywhere the shared hero runs:** movie, show and game pages through `DetailHero`, and `DetailHeroSkeleton` through the shared `DETAIL_HERO_BOX`. The season page has no backdrop; a title with no backdrop keeps its collapsed layout.
5. **1440×900 shrinks to 810px.** The poster and title rise about 90px and the Overview starts 90px higher. Accepted. 1024×768 likewise drops to the 620px floor.
6. **The poster sits at the foot of the art (owner, 2026-11-03, after reviewing the first build).** `lg:pb-[16vh]` is dropped, so the phone's `pb-10` holds at every width and the poster's foot sits 40px above the art's bottom edge, as on a phone. Replaces the first build's `16vh`, which left the poster's foot at 74% to 82% of the art's height.
7. **The 620px floor stays**, so a short wide window still fits a long title block (the box is a minimum height and grows past it).
8. **The landing hero is a follow-up**, not changed here.

## Assumptions

- `56.25vw` counts the scrollbar while the art does not, so the hero runs a few pixels (about 8px with a 15px scrollbar) past the art, inside its faded edge. Not visible; accepted over a container query for one value.

## Expected files

- `components/catalog/detail-hero.tsx`: `lg:min-h-[max(100svh,620px)]` becomes `lg:min-h-[max(min(100svh,56.25vw,900px),620px)]` in `DETAIL_HERO_BOX`, and `lg:pb-[16vh]` is dropped (decision 6); its JSDoc names this plan and says why the height follows the art.
- `prompts/detail-backdrop-hero-size.md`: one line under decision 11 pointing here for `lg` and up.

No test asserts the hero's height class today; no test file changes unless a check shows one does.

## Requirements and acceptance criteria

- AC-1: At 2560×1440 and 1920×1200, the poster and title block sit on the lower part of the backdrop, with no empty band between the art's fade and the poster.
- AC-2: At 1440×900 the hero is about 810px tall and the poster overlaps the art's lower part.
- AC-8: From `lg` the poster's foot sits 40px above the hero's bottom edge, as on a phone (decision 6): the art's bottom edge from about 1100px wide, and up to about 44px lower, inside the art's fade, where the 620px floor (decision 7) outgrows the art (576px of art at 1024px wide).
- AC-3: At 1024×768 the hero is at least 620px tall and the title block is fully visible without scrolling.
- AC-4: Below `lg` (390×844, 768×1024) the hero is unchanged: one screen tall, backdrop cropped to its centre, title block at its foot.
- AC-5: The skeleton and the loaded hero have the same box at every width.
- AC-6: A title with no backdrop renders exactly as before.
- AC-7: The landing hero, cards, lists and the season page are unchanged.

## Security and privacy

None involved: a presentational class change, no data, requests or credentials.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`. `pnpm build` is not required (no route, config, dependency or server code change), but will run if the class change touches a tested component.

## Manual test steps

1. Run `pnpm dev` and open `/movies/550` at 2560×1440. Check that the poster and title sit on the art's lower part, with no plain band above the poster.
2. Repeat at 1920×1200 and 1920×1080. Same check.
3. At 1440×900, check the hero is about 810px tall (DevTools, `header[data-slot="detail-hero"]`) and the poster overlaps the art.
4. At 1024×768, check the whole title block, Trailer button included, is visible without scrolling.
5. At 390×844 and 768×1024, check the hero looks as before: full screen, backdrop as art, title block at its foot.
6. Open `/shows/1399` and a game with art (for example `/games/1942`) at 2560×1440 and 1440×900. Same checks.
7. Throttle to Slow 4G and reload `/movies/550` at 2560×1440. Check the skeleton has the same shape and nothing jumps.
8. Open a title with no backdrop and check it renders as before.

## Follow-up (not in this change)

- The landing hero (`/movies`, `/shows`, `/games`) has the same gap at 2560×1440: its box is a full screen while its art is capped at 900px. Fix it the same way in its own plan.
