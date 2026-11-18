import { RetryLink } from "@/components/retry-link";
import { StatePanel } from "@/components/state-panel";
import type { CatalogList } from "@/lib/catalog/lists";
import { CATALOG_SOURCES } from "@/lib/catalog/media-type";

/**
 * A list page whose catalog read failed, naming its source, with Try again
 * to the page the visitor is on (spec 0021, AC-10; spec 0028, AC-11).
 */
function ListErrorPanel({ list, href }: { list: CatalogList; href: string }) {
  const source = CATALOG_SOURCES[list.mediaType];
  return (
    <StatePanel
      variant="error"
      title={`Couldn't reach ${source}`}
      description={`${source} didn't respond. Try again in a moment.`}
      action={<RetryLink href={href} />}
    />
  );
}

/**
 * Page 1 of a list with no titles. A TMDB list keeps spec 0021's copy
 * (AC-10); a games list names what is missing with its `pageNoun` (spec
 * 0028, AC-11).
 */
function ListEmptyPanel({ list }: { list: CatalogList }) {
  return (
    <StatePanel
      variant="empty"
      title="This list is empty"
      description={
        list.mediaType === "game"
          ? `IGDB lists no ${list.pageNoun} right now.`
          : "TMDB lists nothing here right now."
      }
    />
  );
}

export { ListEmptyPanel, ListErrorPanel };
