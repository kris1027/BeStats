import { cn } from "cn";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { TrailerSlot } from "@/components/catalog/title-extras";
import { GlassPill } from "@/components/glass-pill";
import type { CatalogList } from "@/lib/catalog/lists";
import type { LibraryType } from "@/lib/catalog/media-type";
import { getGameGenres, IgdbError } from "@/lib/igdb";
import {
  getMovieGenres,
  getTvGenres,
  resizeImageUrl,
  TmdbError,
} from "@/lib/tmdb";
import { ArtFallback } from "./art-fallback";
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
 * TMDB's number one trending title over its backdrop, with its TMDB rating,
 * genres, Trailer and the tracking control. It streams behind a skeleton of
 * the same box, so nothing below it moves when it arrives.
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
          "mask-b-from-75% lg:mask-l-from-70% min-[1600px]:mask-r-from-90%",
        )}
      >
        <HeroArtwork item={item} />
        {/*
         * Keeps the title block readable over bright artwork, inside the
         * mask so it fades out with the image rather than painting a band.
         * Below `lg` the title sits under the artwork and needs no shade.
         */}
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden bg-linear-to-r from-background/70 via-background/25 to-transparent lg:block"
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
 * The backdrop, or the poster cropped to fill when TMDB has no backdrop, or
 * the flat missing image plate (decision 10). Decorative: the h2 names it.
 * The backdrop is TMDB's `original`, the one surface that asks for it: it
 * fills a full width box, which `w1280` can only fill stretched, and the
 * loader still serves a ladder size to a screen that needs no more
 * (prompts/home-hero-backdrop-quality.md, decision 2).
 */
function HeroArtwork({ item }: { item: LandingItem }) {
  const src = resizeImageUrl(item.backdropUrl, "original") ?? item.posterUrl;
  if (src === null) {
    return <ArtFallback iconClassName="size-10" />;
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      preload
      sizes="(min-width: 1600px) 1600px, 100vw"
      className="object-cover object-top"
    />
  );
}

/**
 * Each media type's cached genre list, read by the hero's genre line. A game
 * reads IGDB's genres (spec 0028, AC-7); both shapes are `{ id, name }`.
 */
const GENRE_LISTS: Record<
  LibraryType,
  () => Promise<{ id: number; name: string }[]>
> = {
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
  let genres: { id: number; name: string }[];
  try {
    genres = await GENRE_LISTS[item.mediaType]();
  } catch (error) {
    if (!(error instanceof TmdbError) && !(error instanceof IgdbError)) {
      throw error;
    }
    return [];
  }
  const names = new Map(genres.map((genre) => [genre.id, genre.name]));
  return item.genreIds
    .map((id) => names.get(id))
    .filter((name): name is string => name !== undefined)
    .slice(0, 3);
}

export { LandingHero, LandingHeroContent };
