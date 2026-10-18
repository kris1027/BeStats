import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";
import { LANDING_COUNTS } from "@/lib/catalog/landing";

/*
 * The landing sections' layout classes and loading shapes
 * (prompts/home-parallax-landing.md, decision 16), apart from the sections
 * themselves so `/showcase` can render the shapes without importing the
 * server only TMDB reads. Each section and its skeleton share these classes,
 * so a section arriving moves nothing.
 */

/** One card's width in the row, mirrored by `TRENDING_SIZES`. */
export const TRENDING_ITEM_CLASS = "w-[160px] shrink-0 md:w-[260px]";

/** Two columns on a phone, then as many 180px or wider columns as fit. */
export const POPULAR_GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-x-6 md:gap-y-12";

/**
 * The staggered top offsets from `md`, cycled per card (decision 3). Written
 * out in full so Tailwind sees each class.
 */
export const POPULAR_OFFSETS = [
  "md:pt-0",
  "md:pt-15",
  "md:pt-5",
  "md:pt-20",
  "md:pt-10",
] as const;

export const NOW_GRID_CLASS = "grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5";

export const WIDE_CARD_CLASS = "h-[150px] w-[260px] md:h-[200px] md:w-[340px]";

export const TOP_LIST_CLASS =
  "grid gap-x-[5vw] gap-y-10 md:grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] md:gap-y-14";

export const TOP_POSTER_CLASS = "w-[100px] shrink-0 md:w-[140px]";

/**
 * The hero's box: pulled up behind the transparent navbar and out to the
 * column's edges, the way a title page's backdrop is (`detail-hero.tsx`,
 * prompts/title-backdrop-under-navbar.md). The negative margins are `main`'s
 * padding plus `--navbar-height`. From `lg` it is full height with the title
 * over the artwork; below it the artwork is a band and the title flows under
 * it, because a portrait screen cannot show a 16:9 backdrop at full height
 * without blowing it up (prompts/home-hero-backdrop-quality.md, decision 4).
 */
export const HERO_BOX =
  "relative -mx-4 -mt-[calc(2rem+var(--navbar-height))] flex flex-col overflow-hidden pb-4 md:-mt-[calc(3rem+var(--navbar-height))] lg:block lg:h-svh lg:min-h-[620px] lg:pb-0";

/**
 * The artwork's box: 16:9 at the hero's width, never taller than the hero,
 * so the backdrop is drawn near its own size rather than covered across a
 * full screen (decision 1). From `lg` it bleeds 16px past each side so the
 * pointer drift never shows an edge. Below `lg` it keeps the title page's
 * minimum, so the band still shows below the two row navbar.
 */
export const HERO_ART_BOX =
  "relative aspect-video min-h-[calc(var(--navbar-height)+12rem)] w-full lg:absolute lg:-inset-x-4 lg:top-0 lg:max-h-full lg:min-h-0 lg:w-auto";

/**
 * The title block: under the band below `lg`, held at a two line title's
 * height so the sections below barely move when it streams in, and over the
 * artwork's lower part from `lg`.
 */
export const HERO_TEXT_BOX =
  "relative -mt-8 flex min-h-52 max-w-3xl flex-col gap-4 px-4 md:gap-5 md:px-[5vw] lg:absolute lg:inset-x-[5vw] lg:bottom-[16vh] lg:mt-0 lg:min-h-0 lg:px-0";

/** Four ranked card shapes at the row's card width. */
function TrendingSkeleton() {
  return (
    <ul aria-hidden="true" className="flex w-max gap-4 md:gap-7">
      {Array.from({ length: 4 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index} className="flex items-end">
          <Skeleton
            shape="line"
            className="mr-2 mb-9 h-16 w-10 md:h-28 md:w-20"
          />
          <div className={TRENDING_ITEM_CLASS}>
            <PosterCardSkeleton />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PopularSkeleton() {
  return (
    <ul aria-hidden="true" className={POPULAR_GRID_CLASS}>
      {Array.from({ length: LANDING_COUNTS.popular }, (_, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
          key={index}
          className={POPULAR_OFFSETS[index % POPULAR_OFFSETS.length]}
        >
          <PosterCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

function NowSkeleton() {
  return (
    <ul aria-hidden="true" className={NOW_GRID_CLASS}>
      {Array.from({ length: 6 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index}>
          <PosterCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

function UpcomingSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 md:gap-5">
      {[0, 1].map((row) => (
        <div key={row} className="-mx-4 overflow-hidden px-4">
          <div className="flex w-max gap-4 md:gap-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
                key={index}
                shape="poster"
                className={`aspect-auto ${WIDE_CARD_CLASS}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TopRatedSkeleton() {
  return (
    <ul aria-hidden="true" className={TOP_LIST_CLASS}>
      {Array.from({ length: 4 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index} className="flex items-center gap-5 md:gap-7">
          <div className={TOP_POSTER_CLASS}>
            <Skeleton shape="poster" />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton shape="pill" />
            <Skeleton shape="line" className="w-3/4" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The hero's loading shape: the same box, with the title block's outline. */
function LandingHeroSkeleton() {
  return (
    <div aria-hidden="true" className={HERO_BOX}>
      <div className={HERO_ART_BOX} />
      <div className={HERO_TEXT_BOX}>
        <Skeleton shape="pill" className="w-28" />
        <Skeleton shape="line" className="h-14 w-4/5 md:h-24" />
        <Skeleton shape="pill" className="h-11 w-32" />
      </div>
    </div>
  );
}

export {
  LandingHeroSkeleton,
  NowSkeleton,
  PopularSkeleton,
  TopRatedSkeleton,
  TrendingSkeleton,
  UpcomingSkeleton,
};
