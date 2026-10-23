import type * as React from "react";

import { DetailHero, TmdbRatingBlock } from "@/components/catalog/detail-hero";
import { GenreChips, MetaLine } from "@/components/catalog/detail-hero-meta";
import { formatRuntime } from "@/lib/format";
import type { Movie } from "@/lib/tmdb";

type MovieHeroProps = {
  /**
   * The tracking row from spec 0007, rendered under the rating block. The page
   * passes a Suspense wrapped `MovieTrackingSlot`; this component reads no
   * session itself, so it stays a plain catalog piece.
   */
  tracking?: React.ReactNode;
  /** The Trailer slot, passed through to `DetailHero` (spec 0022, AC-11). */
  actions?: React.ReactNode;
  /**
   * The age rating chip's slot, shown in the meta row after the runtime
   * (spec 0022, AC-13). It renders nothing when there is no rating.
   */
  ageRating?: React.ReactNode;
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
  actions,
  ageRating,
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
      meta={<MovieMetaRow meta={meta} genres={genres} ageRating={ageRating} />}
      rating={<TmdbRatingBlock value={tmdbRating} voteCount={tmdbVoteCount} />}
      tracking={tracking}
      actions={actions}
    />
  );
}

/**
 * The meta line, the age rating slot and the genre chips in one wrapping
 * row, or nothing when the movie has none of them.
 */
function MovieMetaRow({
  meta,
  genres,
  ageRating,
}: {
  meta: string[];
  genres: Movie["genres"];
  ageRating?: React.ReactNode;
}) {
  if (meta.length === 0 && genres.length === 0 && !ageRating) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {meta.length > 0 ? <MetaLine parts={meta} /> : null}
      {ageRating}
      {genres.length > 0 ? <GenreChips genres={genres} /> : null}
    </div>
  );
}

export { TmdbRatingBlock } from "@/components/catalog/detail-hero";
export { GenreChips, MetaLine } from "@/components/catalog/detail-hero-meta";
export { MovieHero };
