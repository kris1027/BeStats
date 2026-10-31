import { cn } from "cn";
import Link from "next/link";
import { Suspense } from "react";

import { TrailerSlot } from "@/components/catalog/title-extras";
import { GlassPill } from "@/components/glass-pill";
import type { CatalogList } from "@/lib/catalog/lists";
import type { LibraryType } from "@/lib/catalog/media-type";
import { isCatalogError } from "@/lib/catalog-errors";
import { getGameGenres } from "@/lib/igdb";
import {
  type Genre,
  getMovieGenres,
  getTvGenres,
  resizeImageUrl,
} from "@/lib/tmdb";
import { ArtFallback } from "./art-fallback";
import { HeroPicture } from "./hero-picture";
import { CommunityRatingBadge, LandingTracking } from "./landing-badge";
import {
  type LandingItem,
  landingItems,
  readLandingList,
} from "./landing-items";
import {
  HERO_ART_BOX,
  HERO_BOX,
  HERO_TEXT_BOX,
  LandingHeroSkeleton,
} from "./landing-skeletons";

/**
 * The landing's hero (prompts/home-parallax-landing.md, decisions 4 and 11):
 * TMDB's number one trending title over its artwork, a full screen at every
 * width (prompts/mobile-landing-parallax.md, decision 12), with its TMDB
 * rating, genres, Trailer and the tracking control. It streams behind a
 * skeleton of the same box, so nothing below it moves when it arrives.
 */
function LandingHero({ list }: { list: CatalogList }) {
  return (
    <Suspense fallback={<LandingHeroSkeleton />}>
      <LandingHeroContent list={list} />
    </Suspense>
  );
}

/**
 * The hero's body. When trending fails or loads empty there is no hero at
 * all: the pinned Trending row right below makes the same cached read and
 * shows the section's heading with its one error or empty state, so the page
 * never shows two Try again panels for one list (decision 4,
 * prompts/landing-review-fixes.md, decision 2).
 */
async function LandingHeroContent({ list }: { list: CatalogList }) {
  const page = await readLandingList(list);
  if (page === null) return null;
  const [item] = landingItems(page, 0, 1);
  if (!item) return null;
  const genres = await genreNames(item);

  return (
    <section aria-labelledby="landing-hero-title" className={HERO_BOX}>
      <div
        data-hero-bg=""
        suppressHydrationWarning
        className={cn(
          HERO_ART_BOX,
          "mask-b-from-60% lg:mask-b-from-75% lg:mask-l-from-70% min-[1600px]:mask-r-from-90%",
        )}
      >
        <HeroArtwork item={item} />
        {/*
         * Keeps the title block readable over bright artwork, inside the
         * mask so it fades out with the image rather than painting a band:
         * from below on a phone, where the title sits over the poster's
         * foot, and from the left from `lg`.
         */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-background/80 via-background/30 via-35% to-transparent to-60% lg:bg-linear-to-r lg:from-background/70 lg:via-background/25 lg:via-50% lg:to-transparent lg:to-100%"
        />
      </div>
      <div aria-hidden="true" className="backdrop-scrim absolute inset-0" />

      <div data-hero-fg="" suppressHydrationWarning className={HERO_TEXT_BOX}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-secondary">
          <GlassPill className="font-semibold text-foreground">
            #1 Trending
          </GlassPill>
          <CommunityRatingBadge rating={item.rating} />
          {genres.length > 0 ? <span>{genres.join(", ")}</span> : null}
        </div>
        <h2
          id="landing-hero-title"
          className="text-5xl leading-[0.95] font-extrabold tracking-[-0.04em] text-balance text-foreground md:text-7xl xl:text-8xl"
        >
          <Link href={item.href} className="rounded-sm hover:underline">
            {item.title}
          </Link>
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 md:mt-4">
          {/* A game has no trailer until G9 (spec 0028, AC-7). */}
          {item.mediaType === "game" ? null : (
            <TrailerSlot
              mediaType={item.mediaType}
              id={item.id}
              title={item.title}
            />
          )}
          <LandingTracking item={item} />
        </div>
      </div>

      <div
        data-hero-cue=""
        suppressHydrationWarning
        aria-hidden="true"
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 text-xs tracking-[0.14em] text-muted-foreground uppercase lg:block"
      >
        Scroll
      </div>
    </section>
  );
}

/**
 * The hero's artwork: the phone's poster and the wide screen's backdrop
 * (`HeroPicture`), or the flat missing image plate when there is neither
 * (decision 10). The backdrop is TMDB's `original`, the one surface that asks
 * for it: it fills a full width box, which `w1280` can only fill stretched,
 * and the loader still serves a ladder size to a screen that needs no more
 * (prompts/home-hero-backdrop-quality.md, decision 2). The poster stops at
 * `w780`, TMDB's largest poster rung.
 */
function HeroArtwork({ item }: { item: LandingItem }) {
  const backdrop = resizeImageUrl(item.backdropUrl, "original");
  const poster = resizeImageUrl(item.posterUrl, "w780");
  if (backdrop === null && poster === null) {
    return <ArtFallback iconClassName="size-10" />;
  }
  return <HeroPicture backdrop={backdrop} poster={poster} />;
}

/**
 * Each media type's cached genre list, read by the hero's genre line. A game
 * reads IGDB's genres (spec 0028, AC-7), whose `GameRef` has TMDB's
 * `Genre` shape, `{ id, name }`.
 */
const GENRE_LISTS: Record<LibraryType, () => Promise<Genre[]>> = {
  tv: getTvGenres,
  movie: getMovieGenres,
  game: getGameGenres,
};

/**
 * The featured title's genre names, from the cached genre list its media
 * type has. A failed genre read, TMDB's or IGDB's, leaves the genres out
 * rather than failing the hero.
 */
async function genreNames(item: LandingItem): Promise<string[]> {
  let genres: Genre[];
  try {
    genres = await GENRE_LISTS[item.mediaType]();
  } catch (error) {
    if (!isCatalogError(error)) throw error;
    return [];
  }
  const names = new Map(genres.map((genre) => [genre.id, genre.name]));
  return item.genreIds
    .map((id) => names.get(id))
    .filter((name): name is string => name !== undefined)
    .slice(0, 3);
}

export { LandingHero, LandingHeroContent };
