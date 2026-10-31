import { PosterCardSkeleton, Skeleton } from "@/components/skeleton";
import { LANDING_COUNTS } from "@/lib/catalog/landing";

/*
 * The landing sections' layout classes, Top rated's column speeds and the
 * loading shapes (prompts/home-parallax-landing.md, decision 16), apart from
 * the sections themselves so `/showcase` can render the shapes without importing the
 * server only TMDB reads. Each section and its skeleton share these classes,
 * so a section arriving moves nothing.
 */

/**
 * One card's width in the row, mirrored by `TRENDING_SIZES`. On a phone the
 * pinned row fills the screen it holds: the poster is as tall as the height
 * left after the header, title and bar (about 15rem), never wider than 72vw
 * so the next card peeks in, and never under 140px on a landscape phone
 * (prompts/mobile-landing-parallax.md, decision 11). The swipe row of reduced
 * motion keeps 160px.
 */
export const TRENDING_ITEM_CLASS =
  "w-[160px] shrink-0 max-md:motion-safe:w-[clamp(140px,calc((100svh_-_15rem)*2/3),72vw)] md:w-[260px]";

/** Two columns on a phone, then as many 180px or wider columns as fit. */
export const POPULAR_GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-x-6 md:gap-y-12";

/**
 * The staggered top offsets from `md`, cycled per card (decision 3). Written
 * out in full so Tailwind sees each class.
 */
const POPULAR_OFFSETS = [
  "md:pt-0",
  "md:pt-15",
  "md:pt-5",
  "md:pt-20",
  "md:pt-10",
] as const;

/**
 * A Popular card's stagger: the five step offsets from `md`, and on a
 * phone's two columns the right one lowered, the same rhythm in the space
 * there is (prompts/mobile-landing-parallax.md, decision 7). The skeleton
 * uses it too, so the grid does not shift when the cards stream in.
 */
export function popularOffsetClass(index: number): string {
  const wide = POPULAR_OFFSETS[index % POPULAR_OFFSETS.length];
  return index % 2 ? `max-md:pt-8 ${wide}` : wide;
}

export const NOW_GRID_CLASS = "grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5";

export const WIDE_CARD_CLASS = "h-[150px] w-[260px] md:h-[200px] md:w-[340px]";

/**
 * Two columns, four from `lg` (prompts/top-rated-parallax-columns.md,
 * decision 1), held to a width that keeps a poster near 240px on a wide
 * screen. The bottom padding is the stagger's, so the lowered last cards
 * never reach the next block.
 */
export const TOP_LIST_CLASS =
  "mx-auto grid w-full grid-cols-2 gap-x-5 gap-y-12 pb-12 md:max-w-2xl md:gap-y-14 md:pb-20 lg:max-w-[70rem] lg:grid-cols-4 lg:gap-x-8 lg:pb-35";

/**
 * The stagger (decision 2): an odd index is an odd column in both layouts,
 * so it moves down. A translate, so the grid rows stay tight.
 */
export function topOffsetClass(index: number): string | undefined {
  return index % 2
    ? "translate-y-12 md:translate-y-20 lg:translate-y-35"
    : undefined;
}

const TOP_COLUMN_SPEEDS = [0, 0.12] as const;
const TOP_COLUMN_SPEEDS_LG = [0, 0.14, 0.04, 0.18] as const;

/**
 * Each column's drift (decision 3), kept beside the stagger because both
 * follow from the column count: two columns below `lg`, four from it, so a
 * card carries both speeds and the motion loop picks one.
 */
export function topColumnSpeeds(index: number): { base: number; lg: number } {
  return {
    base: TOP_COLUMN_SPEEDS[index % TOP_COLUMN_SPEEDS.length],
    lg: TOP_COLUMN_SPEEDS_LG[index % TOP_COLUMN_SPEEDS_LG.length],
  };
}

/** The poster's frame, room above it for the rank (decision 4). */
export const TOP_CARD_CLASS = "relative pt-14 md:pt-20 lg:pt-23";

/**
 * The hero's box: pulled up behind the transparent navbar and out to the
 * column's edges, the way a title page's backdrop is (`detail-hero.tsx`,
 * prompts/title-backdrop-under-navbar.md). The negative margins are `main`'s
 * padding plus `--navbar-height`. A full small viewport at every width, so a
 * phone opens on the title the way a desktop does
 * (prompts/mobile-landing-parallax.md, decision 12); `svh`, so the address
 * bar sliding away does not resize it.
 */
export const HERO_BOX =
  "relative -mx-4 -mt-[calc(2rem+var(--navbar-height))] block h-svh min-h-[560px] overflow-hidden md:-mt-[calc(3rem+var(--navbar-height))] lg:min-h-[620px]";

/**
 * The artwork's box. Below `lg` it covers the hero, which suits the portrait
 * poster shown there. From `lg` it is 16:9 at the hero's width, never taller
 * than the hero, so the backdrop is drawn near its own size rather than
 * covered across a full screen (prompts/home-hero-backdrop-quality.md,
 * decision 1). It bleeds 16px past each side so the pointer drift never
 * shows an edge.
 */
export const HERO_ART_BOX =
  "absolute -inset-x-4 top-0 h-full lg:h-auto lg:aspect-video lg:max-h-full";

/**
 * The title block, over the artwork's lower part: at the foot of a phone's
 * screen, above the next section's peek, and higher up from `lg`.
 */
export const HERO_TEXT_BOX =
  "absolute inset-x-0 bottom-10 flex max-w-3xl flex-col gap-4 px-4 md:gap-5 md:px-[5vw] lg:inset-x-[5vw] lg:bottom-[16vh] lg:px-0";

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
          className={popularOffsetClass(index)}
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
      {Array.from({ length: LANDING_COUNTS.upcomingRows }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
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
    <ol aria-hidden="true" className={TOP_LIST_CLASS}>
      {Array.from({ length: 4 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
        <li key={index} className={topOffsetClass(index)}>
          <div className={TOP_CARD_CLASS}>
            <Skeleton shape="poster" className="rounded-xl" />
            <div className="mt-4 flex flex-col gap-2">
              <Skeleton shape="pill" />
              <Skeleton shape="line" className="w-3/4" />
            </div>
          </div>
        </li>
      ))}
    </ol>
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
