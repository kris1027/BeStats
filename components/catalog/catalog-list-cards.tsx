import { MovieListCard, ShowListCard } from "@/components/catalog/list-cards";
import type { TaggedCatalogPage } from "@/lib/catalog-list-read";

/**
 * One `<li>` and full card per title of a list page, the one place a tagged
 * page becomes show or movie cards (spec 0021, AC-4). A landing row and a
 * list page grid both render through it and differ only in the props.
 *
 * `ids` is every id the caller renders, so all the cards' slots share one
 * read (prompts/catalog-card-status.md).
 *
 * @param limit How many titles to render; all of them when left out.
 * @param eagerCount How many leading posters load eagerly (AC-7).
 */
function CatalogListCards({
  result,
  returnPath,
  eagerCount,
  limit,
  sizes,
  itemClassName,
}: {
  result: TaggedCatalogPage;
  returnPath: string;
  eagerCount: number;
  limit?: number;
  sizes?: string;
  itemClassName?: string;
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
