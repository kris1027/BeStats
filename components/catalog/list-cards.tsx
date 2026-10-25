import { Suspense } from "react";

import { PosterCard } from "@/components/poster-card";
import { IgdbRatingBadge, TmdbRatingBadge } from "@/components/rating-badges";
import {
  MovieCardBadge,
  MovieCardControls,
} from "@/components/tracking/movie-card-slots";
import {
  ShowCardBadge,
  ShowCardControls,
  ShowCardMeta,
} from "@/components/tracking/show-card-slots";
import { gameHref } from "@/lib/catalog/media-type";
import type { GameSummary } from "@/lib/igdb";
import type { MovieSummary, TvShowSummary } from "@/lib/tmdb";

type ListCardProps = {
  /** Where a tracking control sends the visitor back to after signing in. */
  returnPath: string;
  priority: boolean;
  /** The poster `sizes`; left out on a grid, set by a carousel row. */
  sizes?: string;
};

/**
 * A show's card on a catalog list, a landing row or a list page (spec 0021,
 * AC-4): the full `PosterCard` with the personal badge, the meta line and the
 * controls, each in its own Suspense boundary so the card never waits on the
 * session.
 *
 * `gridShowIds` is every id of the row or page the card sits in, so the
 * slots share one read and a card shows the show exactly as its library page
 * does (prompts/catalog-card-status.md).
 */
function ShowListCard({
  show,
  gridShowIds,
  returnPath,
  priority,
  sizes,
}: ListCardProps & {
  show: TvShowSummary;
  gridShowIds: readonly number[];
}) {
  return (
    <PosterCard
      title={show.name}
      posterUrl={show.posterUrl}
      href={`/shows/${show.id}`}
      badge={
        <Suspense fallback={<TmdbRatingBadge value={show.tmdbRating} />}>
          <ShowCardBadge
            showId={show.id}
            tmdbRating={show.tmdbRating}
            gridShowIds={gridShowIds}
          />
        </Suspense>
      }
      meta={
        <Suspense fallback={null}>
          <ShowCardMeta
            showId={show.id}
            base={null}
            gridShowIds={gridShowIds}
          />
        </Suspense>
      }
      controls={
        <Suspense fallback={null}>
          <ShowCardControls
            showId={show.id}
            name={show.name}
            gridShowIds={gridShowIds}
            returnPath={returnPath}
          />
        </Suspense>
      }
      priority={priority}
      sizes={sizes}
    />
  );
}

/**
 * The movie twin of `ShowListCard` (spec 0021, AC-4). The badge and controls
 * follow the release gate through `releaseDate`, as on the old landing grid.
 */
function MovieListCard({
  movie,
  gridMovieIds,
  returnPath,
  priority,
  sizes,
}: ListCardProps & {
  movie: MovieSummary;
  gridMovieIds: readonly number[];
}) {
  return (
    <PosterCard
      title={movie.title}
      posterUrl={movie.posterUrl}
      href={`/movies/${movie.id}`}
      badge={
        <Suspense fallback={<TmdbRatingBadge value={movie.tmdbRating} />}>
          <MovieCardBadge
            movieId={movie.id}
            releaseDate={movie.releaseDate}
            tmdbRating={movie.tmdbRating}
            gridMovieIds={gridMovieIds}
          />
        </Suspense>
      }
      controls={
        <Suspense fallback={null}>
          <MovieCardControls
            movieId={movie.id}
            title={movie.title}
            releaseDate={movie.releaseDate}
            gridMovieIds={gridMovieIds}
            returnPath={returnPath}
          />
        </Suspense>
      }
      priority={priority}
      sizes={sizes}
    />
  );
}

/**
 * A game's card on a games list page (spec 0028, AC-8): the cover, the name
 * and IGDB's community rating, linking to the game page. No personal badge
 * and no controls yet, so no session read and no Suspense; G8 adds them.
 */
function GameListCard({
  game,
  priority,
  sizes,
}: Omit<ListCardProps, "returnPath"> & { game: GameSummary }) {
  return (
    <PosterCard
      title={game.name}
      posterUrl={game.coverUrl}
      href={gameHref(game.id)}
      badge={<IgdbRatingBadge value={game.communityRating} />}
      priority={priority}
      sizes={sizes}
    />
  );
}

export { GameListCard, MovieListCard, ShowListCard };
