import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import type { CatalogList } from "@bestats/core/catalog/lists";
import { formatReleaseDate } from "@bestats/core/format";

/**
 * The release date pill a card of `list` prints, or null. Only a list core
 * marks `datedCards` (games' Coming soon) prints one, as the web's
 * `CatalogListCards` does (spec 0028, AC-8); the text is core's
 * `formatReleaseDate`, so both apps print the same UTC day (AGENTS.md
 * section 9, air dates are UTC days).
 *
 * @param today The UTC day (`todayUtc`), for the short date's year rule.
 */
export function cardDateLabel(
  list: CatalogList,
  item: V1CatalogItem,
  today: string,
): string | null {
  if (list.mediaType !== "game" || !list.datedCards) return null;
  return formatReleaseDate(item.releaseDate, today)?.shortDate ?? "Date TBA";
}
