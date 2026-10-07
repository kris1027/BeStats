import { Suspense } from "react";

import { PosterCard } from "@/components/poster-card";
import type { LibraryTitle } from "@/lib/tracking/library-lists";
import type { EpisodePlace } from "@/lib/tv/library-page";

import { showCardLinkId } from "./ids";
import {
  NextEpisodeName,
  WatchlistShowControls,
  WatchlistShowControlsPending,
} from "./watchlist-show-controls";

/**
 * One show on Watchlist (spec 0020, AC-9), the spec 0014 Up Next card on
 * `PosterCard`: the poster, the name linking to the show, the next episode
 * as "S1E3" with its name once it loads, and Mark watched. No rating badge.
 *
 * The poster, the name and the pill render at once: classification already
 * named the episode. The button and the episode name wait on the season
 * read, each in a Suspense boundary of its own that reads the same cached
 * state, so no card holds up another.
 */
function WatchlistShowCard({
  showId,
  title,
  next,
  priority,
}: {
  showId: number;
  title: LibraryTitle;
  next: EpisodePlace;
  priority: boolean;
}) {
  return (
    <PosterCard
      title={title.name}
      posterUrl={title.posterUrl}
      href={`/shows/${showId}`}
      linkId={showCardLinkId(showId)}
      controls={
        <Suspense fallback={<WatchlistShowControlsPending next={next} />}>
          <WatchlistShowControls
            showId={showId}
            showName={title.name}
            next={next}
          />
        </Suspense>
      }
      meta={
        <Suspense fallback={null}>
          <NextEpisodeName showId={showId} next={next} />
        </Suspense>
      }
      priority={priority}
    />
  );
}

export { WatchlistShowCard };
