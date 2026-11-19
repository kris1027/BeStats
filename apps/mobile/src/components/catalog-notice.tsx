import {
  CATALOG_SOURCES,
  type LibraryType,
} from "@bestats/core/catalog/media-type";
import { TMDB_ATTRIBUTION } from "@bestats/core/legal/attribution";
import { IGDB_ATTRIBUTION } from "@bestats/core/legal/operator";
import { Text } from "react-native";

/**
 * The catalog notice under every screen that shows catalog data (spec 0033,
 * AC-14): TMDB's required notice for shows and movies, IGDB's credit for
 * games, the same text the web footer prints, from core. The logos live on
 * the About screen (slice 5d).
 */
export function CatalogNotice({ type }: { type: LibraryType }) {
  const text =
    CATALOG_SOURCES[type] === "IGDB" ? IGDB_ATTRIBUTION : TMDB_ATTRIBUTION;
  return (
    <Text className="px-4 pt-6 pb-4 text-xs text-muted-foreground">{text}</Text>
  );
}
