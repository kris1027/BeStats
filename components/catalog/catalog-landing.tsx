import { LandingHero } from "@/components/catalog/landing/landing-hero";
import { LandingParallax } from "@/components/catalog/landing/landing-parallax";
import { NowPlayingColumns } from "@/components/catalog/landing/now-playing-columns";
import { PopularGrid } from "@/components/catalog/landing/popular-grid";
import { TopRatedList } from "@/components/catalog/landing/top-rated-list";
import { TrendingPin } from "@/components/catalog/landing/trending-pin";
import { UpcomingRows } from "@/components/catalog/landing/upcoming-rows";
import { landingSlots } from "@/lib/catalog/landing";
import type { LibraryType } from "@/lib/catalog/media-type";

/**
 * A catalog landing, `/shows`, `/movies` or `/games` (prompts/home-parallax-
 * landing.md, superseding the rows of spec 0021; spec 0028, AC-1): the hero, then Trending, Popular, Now
 * playing (Airing today), Upcoming (On the air) and Top rated, each with its
 * own layout and motion.
 *
 * The h1 is for the outline and assistive technology only; the hero's title
 * is the visible headline. Every heading, label and See all link is in the
 * prerendered shell, and each section's titles stream in their own Suspense
 * boundary, so a slow or failing list holds up nothing else (decision 16).
 */
function CatalogLanding({
  heading,
  mediaType,
}: {
  heading: string;
  mediaType: LibraryType;
}) {
  const slots = landingSlots(mediaType);

  return (
    <LandingParallax className="relative flex flex-col">
      <LandingBlobs />
      <h1 className="sr-only">{heading}</h1>
      <LandingHero list={slots.trending} />
      <TrendingPin list={slots.trending} />
      <PopularGrid list={slots.popular} />
      <NowPlayingColumns list={slots.now} label={slots.nowLabel} />
      <UpcomingRows list={slots.upcoming} />
      <TopRatedList list={slots.top} />
    </LandingParallax>
  );
}

/**
 * Soft lights behind the landing that drift at two depths with the scroll
 * and the mouse (decision 7). Fixed above the page background and below the
 * content, decorative, and never in the way of a click. Their tints are the
 * background's own (`landing-blob`, `landing-orb` in `globals.css`).
 */
function LandingBlobs() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-1 overflow-hidden"
    >
      <div
        data-depth="0.12"
        suppressHydrationWarning
        className="absolute inset-0"
      >
        <div className="landing-blob absolute top-[120vh] left-[70%] size-80" />
        <div className="landing-blob absolute top-[220vh] left-[6%] size-105" />
        <div className="landing-blob absolute top-[420vh] left-[55%] size-95" />
      </div>
      <div
        data-depth="0.35"
        suppressHydrationWarning
        className="absolute inset-0"
      >
        <div className="landing-orb absolute top-[150vh] left-[88%] size-17.5" />
        <div className="landing-orb absolute top-[300vh] left-[12%] size-11.5" />
        <div className="landing-orb absolute top-[520vh] left-[80%] size-22.5" />
      </div>
    </div>
  );
}

export { CatalogLanding };
