import {
  GameListCard,
  MovieListCard,
  ShowListCard,
} from "@/components/catalog/list-cards";
import type { TaggedCatalogPage } from "@/lib/catalog-list-read";

/**
 * One `<li>` and full card per title of a list page, the one place a tagged
 * page becomes show, movie or game cards (spec 0021, AC-4; spec 0028, AC-8). A landing row and a
 * list page grid both render through it and differ only in the props.
 *
 * `ids` is every id the caller renders, so all the cards' slots share one
 * read (prompts/catalog-card-status.md).
 *
 * @param limit How many titles to render; all of them when left out.
 * @param eagerCount How many leading posters load eagerly (AC-7).
 * @param releaseDay The request's UTC day, set on a games list whose cards
 * print their release date (spec 0028, AC-8).
 */
function CatalogListCards({
  result,
  returnPath,
  eagerCount,
  limit,
  sizes,
  itemClassName,
  releaseDay,
}: {
  result: TaggedCatalogPage;
  returnPath: string;
  eagerCount: number;
  limit?: number;
  sizes?: string;
  itemClassName?: string;
  releaseDay?: string;
}) {
  if (result.mediaType === "tv") {
    const shows = result.paged.results.slice(0, limit);
    const ids = shows.map((show) => show.id);
    return shows.map((show, index) => (
      <li key={show.id} className={itemClassName}>
        <ShowListCard
          show={show}
          gridShowIds={ids}
          returnPath={returnPath}
          priority={index < eagerCount}
          sizes={sizes}
        />
      </li>
    ));
  }
  if (result.mediaType === "game") {
    return result.paged.results.slice(0, limit).map((game, index) => (
      <li key={game.id} className={itemClassName}>
        <GameListCard
          game={game}
          priority={index < eagerCount}
          sizes={sizes}
          releaseDay={releaseDay}
        />
      </li>
    ));
  }
  const movies = result.paged.results.slice(0, limit);
  const ids = movies.map((movie) => movie.id);
  return movies.map((movie, index) => (
    <li key={movie.id} className={itemClassName}>
      <MovieListCard
        movie={movie}
        gridMovieIds={ids}
        returnPath={returnPath}
        priority={index < eagerCount}
        sizes={sizes}
      />
    </li>
  ));
}

export { CatalogListCards };
