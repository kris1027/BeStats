import { cn } from "cn";
import { FilmIcon } from "lucide-react";
import Image from "next/image";
import type * as React from "react";

import { TmdbRatingBadge } from "@/components/rating-badges";
import { formatVoteCount } from "@/lib/format";

type DetailHeroProps = {
  title: string;
  tagline: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  /**
   * The facts under the title: a movie's year, runtime and genres, a show's
   * air span, status and genres. Each wrapper composes its own, so this
   * component never learns what kind of title it is showing. Null when the
   * wrapper has nothing to say.
   */
  meta: React.ReactNode;
  tmdbRating: number | null;
  tmdbVoteCount: number;
  /**
   * The tracking row, rendered under the rating block. The movie page passes
   * a Suspense wrapped `MovieTrackingSlot` (spec 0007); the show page leaves
   * it empty until feature 14 adds the status control (spec 0009, AC-18).
   * This component reads no session itself, so it stays a plain catalog piece.
   */
  tracking?: React.ReactNode;
};

/**
 * The top of a title page: the backdrop faded into the page, with the poster
 * and the title block overlapping its lower edge (spec 0006, AC-3; spec 0009,
 * AC-3).
 *
 * Extracted from the movie hero so the show page reuses the same geometry
 * rather than a second design (spec 0009). No reference in `design/` draws
 * this screen; the layout is the one spec 0006 proposed and approved, built
 * only from pieces spec 0004 already made.
 *
 * Every missing value is left out rather than filled. With no backdrop the
 * hero collapses to the poster and title block on the flat page, because a
 * substitute image would be invented artwork. The backdrop and the poster are
 * decorative (`alt=""`): the `h1` beside them already names the title.
 */
function DetailHero({
  title,
  tagline,
  posterUrl,
  backdropUrl,
  meta,
  tmdbRating,
  tmdbVoteCount,
  tracking,
}: DetailHeroProps) {
  return (
    <header data-slot="detail-hero" className="flex flex-col">
      {backdropUrl ? (
        /*
         * Bleeds to the edges of the main column and up to the navbar, so the
         * artwork reads as the page's backdrop rather than a boxed image. The
         * negative margins mirror `main`'s own padding in `app/layout.tsx`.
         */
        <div
          data-slot="detail-backdrop"
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
        <HeroPoster posterUrl={posterUrl} />

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

        {/*
         * The facts, the rating block and, under it, the tracking row. The
         * tracking slot reserves no height and has no skeleton: its Suspense
         * fallback is `null`, so a visitor never sees a placeholder for
         * controls they will not get (spec 0007, Loading).
         */}
        <div className="col-span-2 mt-4 flex flex-col gap-3 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:mt-3">
          {meta}
          <TmdbRatingBlock value={tmdbRating} voteCount={tmdbVoteCount} />
          {tracking}
        </div>
      </div>
    </header>
  );
}

/**
 * The poster at the hero's size, or the fallback tile at the same 2:3
 * footprint (spec 0006, AC-4; spec 0009, AC-5), matching `PosterCard`'s frame, rim and missing poster tile.
 */
function HeroPoster({ posterUrl }: { posterUrl: string | null }) {
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

export { DetailHero, TmdbRatingBlock };
