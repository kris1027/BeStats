import { ImageOffIcon } from "lucide-react";
import Image from "next/image";
import type * as React from "react";

import { TmdbRatingBadge } from "@/components/rating-badges";
import { formatAirDate, formatRuntime } from "@/lib/format";
import type { Episode } from "@/lib/tmdb";

/**
 * One episode on a season page (spec 0009, AC-10).
 *
 * Every field is TMDB's, and every missing one is stated or left out, never
 * filled: no name makes `Episode {n}` the heading, no date reads `Air date not
 * announced`, no rating shows nothing rather than a zero. No row is labelled
 * upcoming or aired; that needs the eligibility rule features 12 and 14 own,
 * and the date alone already says it honestly.
 *
 * The still is decorative (`alt=""`): the heading beside it names the episode.
 */
function EpisodeRow({
  episode,
  eager = false,
  tracking,
}: {
  episode: Pick<
    Episode,
    | "episodeNumber"
    | "name"
    | "airDate"
    | "runtimeMinutes"
    | "tmdbRating"
    | "overview"
    | "stillUrl"
  >;
  /** Loads the still eagerly, for the first rows (`EAGER_STILLS`). */
  eager?: boolean;
  /**
   * Where feature 12's watched toggle and episode rating land. Left undefined
   * here, so it renders nothing (AC-18).
   */
  tracking?: React.ReactNode;
}) {
  const number = `Episode ${episode.episodeNumber}`;
  const airDate = formatAirDate(episode.airDate);

  return (
    <article className="flex flex-col gap-4 py-6 md:flex-row md:gap-6">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg md:w-60">
        {episode.stillUrl ? (
          <Image
            src={episode.stillUrl}
            alt=""
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="(min-width: 768px) 240px, 100vw"
            className="object-cover"
          />
        ) : (
          <div
            data-slot="still-fallback"
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-glass-plate"
          >
            <ImageOffIcon
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

      <div className="flex min-w-0 flex-col gap-2">
        {episode.name ? (
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {number}
          </p>
        ) : null}
        <h2 className="text-lg leading-snug font-bold text-foreground md:text-xl">
          {episode.name ?? number}
        </h2>
        <p className="text-sm text-text-secondary">
          {airDate ?? "Air date not announced"}
          {episode.runtimeMinutes !== null ? (
            <>
              <span aria-hidden="true" className="px-1.5">
                ·
              </span>
              {formatRuntime(episode.runtimeMinutes)}
            </>
          ) : null}
        </p>
        {episode.tmdbRating !== null ? (
          <p data-slot="tmdb-rating" className="flex items-center gap-2.5">
            <TmdbRatingBadge value={episode.tmdbRating} />
            <span className="text-sm font-bold text-text-label">TMDB</span>
          </p>
        ) : null}
        {episode.overview ? (
          <p className="line-clamp-3 max-w-[65ch] text-[15px] leading-relaxed text-text-secondary">
            {episode.overview}
          </p>
        ) : null}
        {tracking}
      </div>
    </article>
  );
}

export { EpisodeRow };
