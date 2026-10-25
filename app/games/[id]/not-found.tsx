import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { CATALOG_PATHS } from "@/lib/catalog/media-type";

/**
 * A game id IGDB does not know, or one the catalog filter hides (spec 0025,
 * AC-7).
 *
 * Rendered inside the page shell after it has streamed, so the status is 200:
 * a soft 404, kept out of search results by `noindex`. A malformed id never
 * gets here; `proxy.ts` answers it with a real 404 first (AC-6). The button
 * leads to the games landing (spec 0028, AC-17).
 */
export default function GameNotFound() {
  return (
    <div className="flex flex-1 flex-col justify-center py-12">
      <StatePanel
        variant="empty"
        title="We couldn't find that game"
        description="IGDB has no game at this address. It may have been removed, or the link may be wrong."
        action={
          <ButtonLink size="touch" href={CATALOG_PATHS.game}>
            Browse games
          </ButtonLink>
        }
      />
    </div>
  );
}
