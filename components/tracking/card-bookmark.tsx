import {
  getWatchlistedMovieIds,
  movieIdsKey,
} from "@/lib/tracking/movie-state";

import { CardBookmarkButton } from "./card-bookmark-button";

/**
 * The bookmark in a `/movies` grid card, for a signed in user (spec 0007,
 * AC-16).
 *
 * Every card on the grid passes the same ids, so every card calls
 * `getWatchlistedMovieIds` with the same key, which React `cache()` collapses
 * into one Supabase read per render. Each card is
 * still its own Suspense boundary, so the posters never wait on the session.
 *
 * A visitor and a failed read both render nothing: the grid is catalog first,
 * and a missing bookmark is quieter than an error on twenty cards (AC-2,
 * AC-17). The failure is logged inside the read.
 *
 * @param movieId The card's movie.
 * @param title The TMDB title, for the accessible name.
 * @param gridMovieIds Every movie id on the grid, the same array for each card.
 * @param returnPath The grid page, for the session expired toast.
 */
async function CardBookmark({
  movieId,
  title,
  gridMovieIds,
  returnPath,
}: {
  movieId: number;
  title: string;
  gridMovieIds: readonly number[];
  returnPath: string;
}) {
  const result = await getWatchlistedMovieIds(movieIdsKey(gridMovieIds));
  if (result.kind !== "ok") return null;

  return (
    <CardBookmarkButton
      movieId={movieId}
      title={title}
      inWatchlist={result.state.has(movieId)}
      returnPath={returnPath}
    />
  );
}

export { CardBookmark };
