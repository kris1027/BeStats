import { FilmIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { CarouselRowError } from "@/components/catalog/carousel-row-states";
import { TrailerSlot } from "@/components/catalog/title-extras";
import { GlassPill } from "@/components/glass-pill";
import { TmdbRatingBadge } from "@/components/rating-badges";
import { MovieTrackingSlot } from "@/components/tracking/movie-tracking-slot";
import { ShowTrackingSlot } from "@/components/tracking/show-tracking-slot";
import type { CatalogList } from "@/lib/catalog/lists";
import { type Genre, getMovieGenres, getTvGenres, TmdbError } from "@/lib/tmdb";
import {
  type LandingItem,
  landingItems,
  readLandingList,
} from "./landing-items";
import { HERO_BOX, LandingHeroSkeleton } from "./landing-skeletons";

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
 * The hero's body. When trending fails the hero shrinks to the row's own
 * error with Try again rather than a tall empty box; when it loads empty
 * there is no hero at all, because there is no title to feature.
 */
async function LandingHeroContent({ list }: { list: CatalogList }) {
  const page = await readLandingList(list);
  if (page === null) {
    return (
      <div className="pt-4 pb-12">
        <CarouselRowError list={list} />
      </div>
    );
  }
  const [item] = landingItems(page, 0, 1);
  if (!item) return null;
  const genres = await genreNames(item);

  return (
    <section aria-labelledby="landing-hero-title" className={HERO_BOX}>
      <div
        data-hero-bg=""
        suppressHydrationWarning
        className="absolute inset-x-0 -inset-y-[10%] mask-b-from-55% mask-l-from-40% min-[1600px]:mask-r-from-83%"
      >
        <HeroArtwork item={item} />
        {/*
         * Keeps the title block readable over bright artwork, inside the
         * mask so it fades out with the image rather than painting a band.
         */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-r from-background/70 via-background/25 to-transparent"
        />
      </div>
      <div aria-hidden="true" className="backdrop-scrim absolute inset-0" />

      <div
        data-hero-fg=""
        suppressHydrationWarning
        className="absolute inset-x-4 bottom-[16vh] flex max-w-3xl flex-col gap-4 md:inset-x-[5vw] md:gap-5"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-secondary">
          <GlassPill className="font-semibold text-foreground">
            #1 Trending
          </GlassPill>
          <TmdbRatingBadge value={item.tmdbRating} />
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
          <TrailerSlot
            mediaType={item.mediaType}
            id={item.id}
            title={item.title}
          />
          <Suspense fallback={null}>
            {item.mediaType === "tv" ? (
              <ShowTrackingSlot showId={item.id} showName={item.title} />
            ) : (
              <MovieTrackingSlot
                movieId={item.id}
                title={item.title}
                releaseDate={item.releaseDate}
              />
            )}
          </Suspense>
        </div>
      </div>

      <div
        data-hero-cue=""
        suppressHydrationWarning
        aria-hidden="true"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs tracking-[0.14em] text-muted-foreground uppercase"
      >
        Scroll
      </div>
    </section>
  );
}

/**
 * The backdrop, or the poster cropped to fill when TMDB has no backdrop, or
 * the flat missing image plate (decision 10). Decorative: the h2 names it.
 */
function HeroArtwork({ item }: { item: LandingItem }) {
  const src = item.backdropUrl ?? item.posterUrl;
  if (src === null) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-glass-plate">
        <FilmIcon
          className="size-10 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
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
 * The featured title's genre names, from the cached genre list its media
 * type has. A failed genre read leaves the genres out rather than failing
 * the hero.
 */
async function genreNames(item: LandingItem): Promise<string[]> {
  let genres: Genre[];
  try {
    genres =
      item.mediaType === "tv" ? await getTvGenres() : await getMovieGenres();
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return [];
  }
  const names = new Map(genres.map((genre) => [genre.id, genre.name]));
  return item.genreIds
    .map((id) => names.get(id))
    .filter((name): name is string => name !== undefined)
    .slice(0, 3);
}

export { LandingHero, LandingHeroContent };
