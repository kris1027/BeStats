import { GlassPill } from "@/components/glass-pill";
import { GenreChips } from "@/components/movie/movie-hero";
import type { Genre } from "@/lib/tmdb";

/**
 * The show hero's facts (spec 0009, AC-3, AC-4): the air span and TMDB's
 * status word in one row, the genre chips on a row of their own, so the
 * status pill never reads as one more genre.
 *
 * The status is TMDB's word verbatim, in a pill that is a label rather than a
 * control. Anything missing is left out with its row; with nothing at all this
 * renders nothing (AC-5).
 */
function ShowMeta({
  airSpan,
  status,
  genres,
}: {
  /** From `formatAirSpan`, or null when TMDB has no first air year. */
  airSpan: string | null;
  /** TMDB's status word; empty when TMDB gives none. */
  status: string;
  genres: Genre[];
}) {
  const hasFacts = airSpan !== null || status !== "";
  if (!hasFacts && genres.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {hasFacts ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {airSpan !== null ? (
            <p className="text-sm text-text-secondary md:text-base">
              {airSpan}
            </p>
          ) : null}
          {status !== "" ? (
            <GlassPill data-slot="show-status">{status}</GlassPill>
          ) : null}
        </div>
      ) : null}
      {genres.length > 0 ? <GenreChips genres={genres} /> : null}
    </div>
  );
}

export { ShowMeta };
