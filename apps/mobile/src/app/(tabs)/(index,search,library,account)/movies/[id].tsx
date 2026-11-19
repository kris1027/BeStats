import {
  catalogList,
  isCatalogListSlug,
  type MovieListSlug,
} from "@bestats/core/catalog/lists";
import { useLocalSearchParams } from "expo-router";

import { CatalogListScreen } from "@/screens/catalog-list-screen";
import { MovieScreen } from "@/screens/movie-screen";

/**
 * `/movies/{id}` and `/movies/{list}`, the same paths as the web: a segment
 * core names as a movie list opens that list, anything else is a movie id,
 * which the movie screen validates (the web's proxy makes the same split).
 */
export default function MovieRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (isCatalogListSlug("movie", id)) {
    return (
      <CatalogListScreen list={catalogList("movie", id as MovieListSlug)} />
    );
  }
  return <MovieScreen />;
}
