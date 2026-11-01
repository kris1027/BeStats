import { cn } from "cn";
import { FilmIcon, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type * as React from "react";

import {
  HERO_ART_FIT,
  HERO_ART_MASK,
  HERO_BLEED,
  HeroShade,
} from "@/components/catalog/hero-frame";
import { IgdbRatingBadge, TmdbRatingBadge } from "@/components/rating-badges";
import { formatVoteCount } from "@/lib/format";
import { resizeImageUrl } from "@/lib/tmdb/images";

/**
 * The hero's box when the title has a backdrop, shared with
 * `DetailHeroSkeleton` so nothing moves when the hero streams in. One full
 * screen at every width, like the landing hero (`HERO_BOX`,
 * prompts/detail-backdrop-hero-size.md, decision 11), with the poster and
 * title block at its foot and the Overview below the fold. A minimum height
 * rather than a fixed one, so a long title block grows the box instead of
 * being cut. It bleeds behind the navbar with the landing's `HERO_BLEED`,
 * given back as padding so the content keeps its place.
 */
const DETAIL_HERO_BOX = `relative ${HERO_BLEED} flex min-h-[max(100svh,560px)] flex-col justify-end overflow-hidden px-4 pt-[calc(2rem+var(--navbar-height))] pb-10 md:pt-[calc(3rem+var(--navbar-height))] lg:min-h-[max(100svh,620px)] lg:pb-[16vh]`;

/**
 * The artwork's box, the landing hero's fit (`HERO_ART_FIT`) without its
 * parallax bleed.
 */
const DETAIL_ART_BOX = `absolute inset-x-0 ${HERO_ART_FIT}`;

/**
 * From `lg` the title block stops at about the landing hero's text width, so
 * long facts wrap inside the shaded left side (decision 13). Only over art: a
 * title with no backdrop renders as it did before the full screen hero (AC-6).
 */
const DETAIL_TEXT_CAP = "lg:max-w-5xl";

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
  /**
   * The community rating block under the facts: `TmdbRatingBlock` on a movie
   * or show, `IgdbRatingBlock` on a game (spec 0025, AC-4). A slot rather than
   * TMDB's numbers, so the hero never assumes which catalog the title is from.
   */
  rating: React.ReactNode;
  /**
   * The icon on the missing poster tile. A film by default; a game passes a
   * controller (spec 0025, AC-5), so a missing cover never reads as a film.
   */
  fallbackIcon?: LucideIcon;
  /**
   * The tracking row, rendered under the rating block. The movie page passes
   * a Suspense wrapped `MovieTrackingSlot` (spec 0007); the show page passes
   * its tracking toggle and progress line, each in its own boundary (spec
   * 0013, spec 0020).
   * This component reads no session itself, so it stays a plain catalog piece.
   */
  tracking?: React.ReactNode;
  /**
   * Public actions beside the tracking row: the Trailer button (spec 0022,
   * AC-11), streamed in its own boundary with no fallback, so it reserves no
   * height and appears only when the title has a trailer.
   */
  actions?: React.ReactNode;
};

/**
 * The top of a title page: one full screen of artwork faded into the page,
 * like the landing hero, with the poster and the title block at its foot
 * (spec 0006, AC-3; spec 0009, AC-3; prompts/detail-backdrop-hero-size.md).
 *
 * Extracted from the movie hero so the show page reuses the same geometry
 * rather than a second design (spec 0009). No original design drew
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
  rating,
  fallbackIcon,
  tracking,
  actions,
}: DetailHeroProps) {
  return (
    <header
      data-slot="detail-hero"
      className={backdropUrl ? DETAIL_HERO_BOX : "flex flex-col"}
    >
      {backdropUrl ? (
        <>
          <div
            data-slot="detail-backdrop"
            className={cn(DETAIL_ART_BOX, HERO_ART_MASK)}
          >
            {/*
             * The backdrop at every width, TMDB's `original` (decisions 2
             * and 12): below `lg` it covers the full screen box, cropped to
             * its centre, so the art never repeats the poster tile in front
             * of it. Its `sizes` follow that crop: a 16:9 image covering the
             * box is the wider of the screen and 178vh (16:9 of a screen's
             * height), and never under 996px, 16:9 of the 560px floor.
             */}
            <Image
              src={resizeImageUrl(backdropUrl, "original") ?? backdropUrl}
              alt=""
              fill
              preload
              sizes="(min-width: 1600px) 1600px, (min-width: 64rem) 100vw, max(100vw, 178vh, 996px)"
              className="object-cover object-center lg:object-top"
            />
            <HeroShade />
          </div>
          {/*
           * The image reaches up behind the navbar, so the bar sits on the
           * artwork. The shade keeps its text and controls readable there; it
           * spans the whole box but fades out 8rem under the bar, so it never
           * reaches the title block at the box's foot.
           */}
          <div aria-hidden="true" className="backdrop-scrim absolute inset-0" />
        </>
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
          backdropUrl && DETAIL_TEXT_CAP,
        )}
      >
        <HeroPoster posterUrl={posterUrl} fallbackIcon={fallbackIcon} />

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
          {rating}
          {tracking}
          {actions}
        </div>
      </div>
    </header>
  );
}

/**
 * The poster at the hero's size, or the fallback tile at the same 2:3
 * footprint (spec 0006, AC-4; spec 0009, AC-5), matching `PosterCard`'s frame, rim and missing poster tile.
 */
function HeroPoster({
  posterUrl,
  fallbackIcon: FallbackIcon = FilmIcon,
}: {
  posterUrl: string | null;
  fallbackIcon?: LucideIcon;
}) {
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
          <FallbackIcon
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

/**
 * The IGDB community rating, beside the TMDB block and built the same way
 * (spec 0025, AC-4): the amber community badge, the word IGDB, and the count.
 * IGDB may send a rating with no count, so a null or zero count is left out
 * rather than shown as `0 votes`. No rating is stated as absent (AC-5).
 */
function IgdbRatingBlock({
  value,
  count,
}: {
  value: number | null;
  count: number | null;
}) {
  if (value === null) {
    return (
      <p data-slot="igdb-rating" className="text-sm text-muted-foreground">
        No IGDB rating yet
      </p>
    );
  }

  return (
    <p data-slot="igdb-rating" className="flex flex-wrap items-center gap-2.5">
      <IgdbRatingBadge value={value} />
      <span className="text-sm font-bold text-text-label">IGDB</span>
      {count === null || count === 0 ? null : (
        <span className="text-sm text-muted-foreground">
          {formatVoteCount(count)}
        </span>
      )}
    </p>
  );
}

export {
  DETAIL_ART_BOX,
  DETAIL_HERO_BOX,
  DETAIL_TEXT_CAP,
  DetailHero,
  IgdbRatingBlock,
  TmdbRatingBlock,
};
