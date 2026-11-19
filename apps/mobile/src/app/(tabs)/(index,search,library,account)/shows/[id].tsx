import {
  catalogList,
  isCatalogListSlug,
  type TvListSlug,
} from "@bestats/core/catalog/lists";
import { useLocalSearchParams } from "expo-router";

import { CatalogListScreen } from "@/screens/catalog-list-screen";
import { ShowScreen } from "@/screens/show-screen";

/** `/shows/{id}` and `/shows/{list}`, split as `movies/[id]` is. */
export default function ShowRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (isCatalogListSlug("tv", id)) {
    return <CatalogListScreen list={catalogList("tv", id as TvListSlug)} />;
  }
  return <ShowScreen />;
}
