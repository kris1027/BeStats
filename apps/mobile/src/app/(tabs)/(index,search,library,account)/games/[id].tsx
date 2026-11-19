import {
  catalogList,
  type GameListSlug,
  isCatalogListSlug,
} from "@bestats/core/catalog/lists";
import { useLocalSearchParams } from "expo-router";

import { CatalogListScreen } from "@/screens/catalog-list-screen";
import { GameScreen } from "@/screens/game-screen";

/** `/games/{id}` and `/games/{list}`, split as `movies/[id]` is. */
export default function GameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (isCatalogListSlug("game", id)) {
    return <CatalogListScreen list={catalogList("game", id as GameListSlug)} />;
  }
  return <GameScreen />;
}
