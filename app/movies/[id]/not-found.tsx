import { StatePanel } from "@/components/state-panel";
import { ButtonLink } from "@/components/ui/button";

/**
 * A movie id TMDB does not know, or one it flags as adult (spec 0006, AC-9).
 *
 * Rendered inside the page shell after it has streamed, so the status is 200:
 * a soft 404, kept out of search results by `noindex`. A malformed id never
 * gets here; `proxy.ts` answers it with a real 404 first (AC-8).
 */
export default function MovieNotFound() {
  return (
    <div className="flex flex-1 flex-col justify-center py-12">
      <StatePanel
        variant="empty"
        title="We couldn't find that movie"
        description="TMDB has no movie at this address. It may have been removed, or the link may be wrong."
        action={
          <ButtonLink size="touch" href="/movies">
            Browse popular movies
          </ButtonLink>
        }
      />
    </div>
  );
}
