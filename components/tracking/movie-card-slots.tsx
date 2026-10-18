/**
 * The two personal slots of a movie poster card on `/movies` and `/search`
 * (spec 0007, AC-16; prompts/catalog-card-status.md): each card shows the
 * movie the way the library page it sits on does.
 *
 * Every slot on the grid passes the same ids, so `getMovieGridStates` runs
 * once per render for the whole grid. Each slot is still its own Suspense
 * boundary, so the posters never wait on the session. A visitor and a failed
 * read get the catalog card: the grid is catalog first, and a missing status
 * is quieter than an error on twenty cards (AC-2, AC-17). The failure is
 * logged inside the read.
 */
import { ReleasePill } from "@/components/library/dated-pill";
import { PersonalScoreBadge } from "@/components/rating-badges";
import { movieCardStatus } from "@/lib/catalog/movie-page";
import { formatReleaseDate } from "@/lib/format";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { getMovieGridStates, movieIdsKey } from "@/lib/tracking/movie-state";

import { CardBookmarkButton } from "./card-bookmark-button";
import { CardRatingBadge } from "./card-rating-badge";
import { CardWatchedButton } from "./card-watched-button";

type MovieCardProps = {
  movieId: number;
  /** The TMDB release date already on the card. */
  releaseDate: string | null;
  /** Every movie id on the grid, the same array for each card. */
  gridMovieIds: readonly number[];
};

/** The card's status, or undefined for a visitor or a failed read. */
async function readStatus({
  movieId,
  releaseDate,
  gridMovieIds,
}: MovieCardProps) {
  const result = await getMovieGridStates(movieIdsKey(gridMovieIds));
  if (result.kind !== "ok") return undefined;
  const state = result.state.get(movieId);
  return {
    state,
    status: movieCardStatus(state, releaseDate, requestTodayUtc()),
  };
}

/**
 * The top right badge. The page renders the TMDB rating as the fallback, so
 * only the user's own titles swap: the cyan score on a scored watched movie,
 * nothing on an Upcoming one, the TMDB rating otherwise.
 *
 * @param tmdbRating The card's TMDB rating.
 */
async function MovieCardBadge({
  tmdbRating,
  ...props
}: MovieCardProps & { tmdbRating: number | null }) {
  const status = (await readStatus(props))?.status;
  return (
    <CardRatingBadge
      page={status?.page}
      personal={
        status?.page === "watched" && status.rating !== null ? (
          <PersonalScoreBadge value={status.rating} />
        ) : null
      }
      tmdbRating={tmdbRating}
    />
  );
}

/**
 * The bottom row: the filled watched mark on a watched movie, the release
 * pill and the Planned bookmark on an Upcoming one, and the plan bookmark
 * otherwise. Nothing for a visitor or a failed read.
 *
 * @param title The TMDB title, for the accessible names.
 * @param returnPath The grid page, for the session expired toast.
 * @param releasePill False on a card that already prints the release date
 *   for everyone, so the date is not shown twice
 *   (prompts/landing-review-fixes.md, decision 3).
 */
async function MovieCardControls({
  title,
  returnPath,
  releasePill = true,
  ...props
}: MovieCardProps & {
  title: string;
  returnPath: string;
  releasePill?: boolean;
}) {
  const read = await readStatus(props);
  if (read === undefined) return null;
  const { state, status } = read;

  if (status?.page === "watched") {
    return (
      <CardWatchedButton
        movieId={props.movieId}
        title={title}
        returnPath={returnPath}
      />
    );
  }

  return (
    <>
      {releasePill && status?.page === "upcoming" && (
        <ReleasePill
          release={formatReleaseDate(status.releaseDate, requestTodayUtc())}
        />
      )}
      <CardBookmarkButton
        movieId={props.movieId}
        title={title}
        inWatchlist={state?.inWatchlist ?? false}
        returnPath={returnPath}
      />
    </>
  );
}

export { MovieCardBadge, MovieCardControls };
