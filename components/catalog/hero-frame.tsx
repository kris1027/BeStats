/*
 * The pieces the landing hero and the title page hero share
 * (prompts/detail-backdrop-hero-size.md, decisions 11 and 13), so the two
 * full screen heroes bleed, fit, fade and shade their artwork one way. A plain
 * module with no reads, so `/showcase` and the skeletons can import it.
 */

/**
 * The bleed to the edges of the main column and up behind the navbar: `main`'s
 * own padding in `app/layout.tsx` plus `--navbar-height`.
 */
export const HERO_BLEED =
  "-mx-4 -mt-[calc(2rem+var(--navbar-height))] md:-mt-[calc(3rem+var(--navbar-height))]";

/**
 * The artwork's fit inside its hero: below `lg` it covers the hero, and from
 * `lg` it is 16:9 at the hero's width, never taller than the hero, so a
 * backdrop is drawn near its own size (prompts/home-hero-backdrop-quality.md,
 * decision 1).
 */
export const HERO_ART_FIT =
  "top-0 h-full lg:h-auto lg:aspect-video lg:max-h-full";

/**
 * The fade that dissolves the artwork into the page: a mask, not a colour
 * laid over the image, so the art fades into the film strip background.
 */
export const HERO_ART_MASK =
  "mask-b-from-60% lg:mask-b-from-75% lg:mask-l-from-70% min-[1600px]:mask-r-from-90%";

/**
 * Keeps the title block readable over bright artwork. It sits inside the
 * masked art box so it fades out with the image rather than painting a band:
 * from below at every width, where the title sits, and from the left from
 * `lg`, deep enough for a game's bright art and its long Platforms line
 * (decisions 10 and 13).
 */
export function HeroShade() {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-background/85 via-background/40 via-35% to-transparent to-60%"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden bg-linear-to-r from-background/85 via-background/45 via-45% to-transparent to-80% lg:block"
      />
    </>
  );
}
