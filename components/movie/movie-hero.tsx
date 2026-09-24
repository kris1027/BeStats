import type * as React from "react";

import { DetailHero } from "@/components/catalog/detail-hero";
import { GlassPill } from "@/components/glass-pill";
import { formatRuntime } from "@/lib/format";
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
 * The top of a movie page (spec 0006, AC-3): the shared `DetailHero` with the
 * movie's facts, the year and runtime sharing one wrapping row with the genre
 * chips.
 *
 * A thin wrapper since spec 0009 extracted the hero for TV, kept so the movie
 * page's props and tests did not change. Every missing value is left out
 * rather than filled (spec 0006, AC-4).
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
    <DetailHero
      title={title}
      tagline={tagline}
      posterUrl={posterUrl}
      backdropUrl={backdropUrl}
      meta={<MovieFacts meta={meta} genres={genres} />}
      tmdbRating={tmdbRating}
      tmdbVoteCount={tmdbVoteCount}
      tracking={tracking}
    />
  );
}

/**
 * The meta line and the genre chips in one wrapping row, or nothing when the
 * movie has neither.
 */
function MovieFacts({
  meta,
  genres,
}: {
  meta: string[];
  genres: Movie["genres"];
}) {
  if (meta.length === 0 && genres.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {meta.length > 0 ? <MetaLine parts={meta} /> : null}
      {genres.length > 0 ? <GenreChips genres={genres} /> : null}
    </div>
  );
}

/**
 * Facts joined with a decorative ` · `, so a missing part takes its separator
 * with it. Shared with the show hero (spec 0009, AC-7 reuses the separator).
 */
function MetaLine({ parts }: { parts: string[] }) {
  return (
    <p className="text-sm text-text-secondary md:text-base">
      {parts.map((part, index) => (
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
  );
}

/** Genre labels, not controls: there is no genre page to open. */
function GenreChips({ genres }: { genres: Movie["genres"] }) {
  return (
    <ul aria-label="Genres" className="flex flex-wrap gap-2">
      {genres.map((genre) => (
        <li key={genre.id}>
          <GlassPill className="font-semibold">{genre.name}</GlassPill>
        </li>
      ))}
    </ul>
  );
}

export { TmdbRatingBlock } from "@/components/catalog/detail-hero";
export { GenreChips, MetaLine, MovieHero };
