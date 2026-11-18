import { Suspense } from "react";

import { ReleasePill } from "@/components/library/dated-pill";
import { PosterCard } from "@/components/poster-card";
import { IgdbRatingBadge, TmdbRatingBadge } from "@/components/rating-badges";
import {
  GameCardBadge,
  GameCardControls,
} from "@/components/tracking/game-card-slots";
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
import { formatReleaseDate } from "@/lib/format";
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
 * A game's card on a games list page and on `/search?type=game` (spec 0028,
 * AC-8; spec 0030, AC-1): the cover, the name, the release year as the meta
 * line (AC-10), and the personal badge and controls, each in its own
 * Suspense boundary so the card never waits on the session. On Coming soon
 * the bottom row also prints the release day for everyone, so the personal
 * slot leaves out its own release pill (AC-7).
 *
 * @param gridGameIds Every id of the page the card sits in, so the slots
 * share one read.
 * @param releaseDay The request's UTC day, for the date's year rule; left
 * out on a list whose cards print no date.
 */
function GameListCard({
  game,
  gridGameIds,
  returnPath,
  priority,
  sizes,
  releaseDay,
}: ListCardProps & {
  game: GameSummary;
  gridGameIds: readonly number[];
  releaseDay?: string;
}) {
  return (
    <PosterCard
      title={game.name}
      posterUrl={game.coverUrl}
      href={gameHref(game.id)}
      meta={game.releaseYear ?? undefined}
      badge={
        <Suspense fallback={<IgdbRatingBadge value={game.communityRating} />}>
          <GameCardBadge
            gameId={game.id}
            releaseDate={game.releaseDate}
            communityRating={game.communityRating}
            gridGameIds={gridGameIds}
          />
        </Suspense>
      }
      controls={
        <>
          {releaseDay === undefined ? null : (
            <ReleasePill
              release={formatReleaseDate(game.releaseDate, releaseDay)}
            />
          )}
          <Suspense fallback={null}>
            <GameCardControls
              gameId={game.id}
              name={game.name}
              releaseDate={game.releaseDate}
              gridGameIds={gridGameIds}
              returnPath={returnPath}
              releasePill={releaseDay === undefined}
            />
          </Suspense>
        </>
      }
      priority={priority}
      sizes={sizes}
    />
  );
}

export { GameListCard, MovieListCard, ShowListCard };
