import { ArrowLeftIcon, FilmIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type * as React from "react";

import { MetaLine } from "@/components/movie/movie-hero";
import { seasonMetaParts } from "@/lib/format";

/**
 * The top of a season page (spec 0009, AC-9): a way back to the show, then a
 * compact header with no backdrop, because the show page already carries the
 * artwork and a second hero would push the episodes below the fold.
 *
 * The season's `h1` is its own name; the show name sits above it as a muted
 * line so the page still says whose season this is. The overview is English
 * only, left out when TMDB has none, with no fallback (AC-6).
 */
function SeasonHeader({
  showId,
  showName,
  seasonName,
  posterUrl,
  airDate,
  episodeCount,
  overview,
  tracking,
}: {
  showId: number;
  showName: string;
  seasonName: string;
  /** The season poster, else the show's, else null for the fallback tile. */
  posterUrl: string | null;
  airDate: string | null;
  episodeCount: number;
  overview: string | null;
  /**
   * The season's tracking slot, inside its own Suspense boundary: the mark
   * season button and count (spec 0011), later feature 13's season rating.
   * Undefined renders nothing.
   */
  tracking?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6">
      <Link
        href={`/shows/${showId}`}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-sm text-sm font-semibold text-text-secondary hover:text-foreground md:min-h-9"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        {showName}
      </Link>

      {/*
       * One grid, two arrangements, like the show hero. On a phone the small
       * poster sits beside the title and the overview runs full width
       * underneath; from `md` the poster spans both rows and the overview
       * sits under the title, beside it.
       */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 md:grid-rows-[auto_1fr] md:gap-x-8">
        <div className="relative col-start-1 row-start-1 aspect-2/3 w-24 shrink-0 self-start overflow-hidden rounded-lg glass-shadow md:row-span-2 md:w-40">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt=""
              fill
              preload
              sizes="(min-width: 768px) 160px, 96px"
              className="object-cover"
            />
          ) : (
            <div
              data-slot="poster-fallback"
              className="absolute inset-0 flex items-center justify-center rounded-lg bg-glass-plate"
            >
              <FilmIcon
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          )}
          <span
            aria-hidden="true"
            className="rim glass-rim pointer-events-none absolute inset-0 rounded-lg"
          />
        </div>

        <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-2 self-center md:gap-3 md:self-end">
          <p className="text-sm text-muted-foreground md:text-base">
            {showName}
          </p>
          <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.03em] text-balance text-foreground md:text-4xl">
            {seasonName}
          </h1>
          <MetaLine parts={seasonMetaParts(airDate, episodeCount)} />
          {tracking}
        </div>

        {overview ? (
          <p className="col-span-2 mt-4 max-w-[65ch] text-base leading-relaxed text-text-secondary md:col-span-1 md:col-start-2 md:row-start-2 md:mt-3">
            {overview}
          </p>
        ) : null}
      </div>
    </header>
  );
}

export { SeasonHeader };
