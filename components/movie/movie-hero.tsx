import { cn } from "cn";
import { FilmIcon } from "lucide-react";
import Image from "next/image";
import type * as React from "react";

import { GlassPill } from "@/components/glass-pill";
import { TmdbRatingBadge } from "@/components/rating-badges";
import { formatRuntime, formatVoteCount } from "@/lib/format";
import type { Movie } from "@/lib/tmdb";

type MovieHeroProps = {
  /**
   * The tracking row from spec 0007, rendered under the rating block. The page
   * passes a Suspense wrapped `MovieTrackingSlot`; this component reads no
   * session itself, so it stays a plain catalog piece.
   */
  tracking?: React.ReactNode;
} & Pick<
  Movie,
  | "title"
  | "tagline"
  | "posterUrl"
  | "backdropUrl"
  | "releaseYear"
  | "runtimeMinutes"
  | "genres"
  | "tmdbRating"
  | "tmdbVoteCount"
>;

/**
 * The top of a movie page: the backdrop faded into the page, with the poster
 * and the title block overlapping its lower edge (spec 0006, AC-3).
 *
 * No reference in `design/` draws this screen, so the layout is the one spec
 * 0006 proposed and approved, built only from pieces spec 0004 already made:
 * the black page, the poster frame and rim, `GlassPill` and the TMDB badge.
 *
 * Every missing value is left out rather than filled (AC-4). With no backdrop
 * the hero collapses to the poster and title block on the flat page, because a
 * substitute image would be invented artwork. The backdrop and the poster are
 * decorative (`alt=""`): the `h1` beside them already names the movie (AC-14).
 */
function MovieHero({
  title,
  tagline,
  posterUrl,
  backdropUrl,
  releaseYear,
  runtimeMinutes,
  genres,
  tmdbRating,
  tmdbVoteCount,
  tracking,
}: MovieHeroProps) {
  const meta = [
    releaseYear === null ? null : String(releaseYear),
    runtimeMinutes === null ? null : formatRuntime(runtimeMinutes),
  ].filter((part): part is string => part !== null);

  return (
    <header data-slot="movie-hero" className="flex flex-col">
      {backdropUrl ? (
        /*
         * Bleeds to the edges of the main column and up to the navbar, so the
         * artwork reads as the page's backdrop rather than a boxed image. The
         * negative margins mirror `main`'s own padding in `app/layout.tsx`.
         */
        <div
          data-slot="movie-backdrop"
          className="relative -mx-4 -mt-8 aspect-video max-h-[70vh] overflow-hidden md:-mt-12"
        >
          <Image
            src={backdropUrl}
            alt=""
            fill
            preload
            sizes="(min-width: 1600px) 1600px, 100vw"
            className="object-cover object-top"
          />
          {/*
           * The fade into the page, written with the `background` token so it
           * always meets the real page colour. Bottom third and left side per
           * the spec; the right edge only fades once the column stops at its
           * 1600px cap and the image would otherwise end in a hard line.
           */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-background to-transparent"
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-background to-transparent"
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 hidden w-1/6 bg-linear-to-l from-background to-transparent min-[1600px]:block"
          />
        </div>
      ) : null}

      {/*
       * One grid, two arrangements. On a phone the poster sits beside the
       * title and the facts run full width underneath; from `sm` the poster
       * spans both rows and the facts sit directly under the title, beside it.
       * The first row takes the slack (`1fr`), so the title block stays
       * pinned to the bottom of the poster rather than floating at its top.
       */}
      <div
        className={cn(
          "relative z-10 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 sm:grid-rows-[1fr_auto] md:gap-x-8",
          backdropUrl ? "-mt-10 sm:-mt-20 md:-mt-40" : null,
        )}
      >
        <MoviePoster posterUrl={posterUrl} />

        <div className="col-start-2 row-start-1 flex flex-col gap-2 self-end md:gap-3">
          <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.03em] text-balance text-foreground sm:text-3xl md:text-5xl">
            {title}
          </h1>
          {tagline ? (
            <p className="text-sm text-text-secondary italic md:text-lg">
              {tagline}
            </p>
          ) : null}
        </div>

        <MovieFacts
          meta={meta}
          genres={genres}
          tmdbRating={tmdbRating}
          tmdbVoteCount={tmdbVoteCount}
          tracking={tracking}
        />
      </div>
    </header>
  );
}

/**
 * The poster at the hero's size, or the fallback tile at the same 2:3
 * footprint (AC-4), matching `PosterCard`'s frame, rim and missing poster tile.
 */
function MoviePoster({ posterUrl }: { posterUrl: string | null }) {
  return (
    <div className="relative col-start-1 row-start-1 aspect-2/3 w-28 shrink-0 self-end overflow-hidden rounded-lg glass-shadow sm:row-span-2 sm:w-40 md:w-60">
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt=""
          fill
          preload
          sizes="(min-width: 768px) 240px, (min-width: 640px) 160px, 112px"
          className="object-cover"
        />
      ) : (
        <div
          data-slot="poster-fallback"
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-glass-plate"
        >
          <FilmIcon
            className="size-8 text-muted-foreground md:size-10"
            aria-hidden="true"
          />
        </div>
      )}
      <span
        aria-hidden="true"
        className="rim glass-rim pointer-events-none absolute inset-0 rounded-lg"
      />
    </div>
  );
}

/**
 * The meta line, the genre chips, the rating block and, under it, the tracking
 * row (spec 0007, AC-1).
 *
 * The tracking slot reserves no height and has no skeleton. Its Suspense
 * fallback is `null`, so a visitor never sees a placeholder for controls they
 * will not get; a signed in user sees the row appear once the read returns,
 * which moves the Overview down once (spec 0007, Loading).
 */
function MovieFacts({
  meta,
  genres,
  tmdbRating,
  tmdbVoteCount,
  tracking,
}: {
  meta: string[];
  genres: Movie["genres"];
  tmdbRating: number | null;
  tmdbVoteCount: number;
  tracking?: React.ReactNode;
}) {
  return (
    <div className="col-span-2 mt-4 flex flex-col gap-3 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:mt-3">
      {meta.length > 0 || genres.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {meta.length > 0 ? (
            <p className="text-sm text-text-secondary md:text-base">
              {meta.map((part, index) => (
                <span key={part}>
                  {index > 0 ? (
                    <span aria-hidden="true" className="px-1.5">
                      ·
                    </span>
                  ) : null}
                  {part}
                </span>
              ))}
            </p>
          ) : null}
          {genres.length > 0 ? (
            <ul aria-label="Genres" className="flex flex-wrap gap-2">
              {genres.map((genre) => (
                <li key={genre.id}>
                  <GlassPill className="font-semibold">{genre.name}</GlassPill>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <TmdbRatingBlock value={tmdbRating} voteCount={tmdbVoteCount} />
      {tracking}
    </div>
  );
}

/**
 * The TMDB community rating, labelled as TMDB in words as well as in amber, so
 * it can never be read as the visitor's own score (AGENTS.md section 9,
 * spec 0006, AC-7). No rating is stated as absent, never shown as zero.
 */
function TmdbRatingBlock({
  value,
  voteCount,
}: {
  value: number | null;
  voteCount: number;
}) {
  if (value === null) {
    return (
      <p data-slot="tmdb-rating" className="text-sm text-muted-foreground">
        No TMDB rating yet
      </p>
    );
  }

  return (
    <p data-slot="tmdb-rating" className="flex flex-wrap items-center gap-2.5">
      <TmdbRatingBadge value={value} />
      <span className="text-sm font-bold text-text-label">TMDB</span>
      <span className="text-sm text-muted-foreground">
        {formatVoteCount(voteCount)}
      </span>
    </p>
  );
}

export { MovieHero, TmdbRatingBlock };
