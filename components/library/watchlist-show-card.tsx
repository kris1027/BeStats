import { Suspense } from "react";

import { MISSING_TITLE } from "@/components/library/library-card";
import { PosterCard } from "@/components/poster-card";

import { upNextCardLinkId } from "./ids";
import {
  UpNextCaption,
  UpNextControls,
  UpNextPillSkeleton,
} from "./up-next-pill";

/** One Up Next card: a Watching show, or one TMDB no longer has. */
export type UpNextItem = {
  showId: number;
  /** Null when TMDB no longer has the show (`missingIds`). */
  name: string | null;
  posterUrl: string | null;
};

/**
 * One card in the Up Next section (spec 0014, AC-5 to AC-8, AC-16), on
 * `PosterCard`, with no TMDB rating badge.
 *
 * The poster and the name render at once. The pill, the Mark watched button
 * and the caught up caption wait on the show's episodes, each in a Suspense
 * boundary of its own that reads the same cached card state, so no card
 * holds up another and the caption always agrees with the pill (AC-6).
 *
 * A show TMDB no longer has keeps its footprint as a "No longer on TMDB"
 * card with no link, pill or button: there is nothing to open or mark (AC-7).
 *
 * @param watchedIdsKey Every Up Next show id, so one watched ids read serves
 * the whole section.
 */
function UpNextCard({
  item,
  watchedIdsKey,
  priority,
}: {
  item: UpNextItem;
  watchedIdsKey: string;
  priority: boolean;
}) {
  if (item.name === null) {
    return <PosterCard title={MISSING_TITLE} posterUrl={null} />;
  }

  return (
    <PosterCard
      title={item.name}
      posterUrl={item.posterUrl}
      href={`/shows/${item.showId}`}
      linkId={upNextCardLinkId(item.showId)}
      controls={
        <Suspense fallback={<UpNextPillSkeleton />}>
          <UpNextControls
            showId={item.showId}
            showName={item.name}
            watchedIdsKey={watchedIdsKey}
          />
        </Suspense>
      }
      meta={
        <Suspense fallback={null}>
          <UpNextCaption showId={item.showId} watchedIdsKey={watchedIdsKey} />
        </Suspense>
      }
      priority={priority}
    />
  );
}

export { UpNextCard };
