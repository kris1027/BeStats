import { Suspense } from "react";

import { EpisodeRow } from "@/components/show/episode-row";
import { EpisodeTrackingSlot } from "@/components/tracking/episode-tracking-slot";
import type { Episode } from "@/lib/tmdb";

/**
 * Stills that load eagerly: the first two rows, which is what fits above the
 * fold on a desktop season page. The counterpart of the landing's
 * `EAGER_POSTERS` (spec 0009, AC-10); every later still loads lazily, so a
 * season of hundreds of episodes stays usable.
 */
const EAGER_STILLS = 2;

/**
 * Every episode of one season, in episode number order, with no pagination
 * (spec 0009, AC-10). The input is copied before sorting because it is a
 * cached value.
 *
 * With `tracking`, each row gets its own tracking slot inside its own
 * Suspense boundary with a `null` fallback, so a visitor sees nothing and the
 * route keeps its prerendered shell (spec 0011, AC-4, AC-20). Every slot gets
 * the same season wide `idsKey`, so the whole list costs one read (AC-18).
 */
function EpisodeList({
  seasonName,
  episodes,
  tracking,
}: {
  seasonName: string;
  episodes: Episode[];
  tracking?: { showId: number; idsKey: string };
}) {
  const ordered = [...episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber,
  );

  return (
    <ol
      aria-label={`Episodes of ${seasonName}`}
      className="flex flex-col divide-y divide-border border-y border-border"
    >
      {ordered.map((episode, index) => (
        <li key={episode.id}>
          <EpisodeRow
            episode={episode}
            eager={index < EAGER_STILLS}
            tracking={
              tracking ? (
                <Suspense fallback={null}>
                  <EpisodeTrackingSlot
                    showId={tracking.showId}
                    idsKey={tracking.idsKey}
                    episode={episode}
                  />
                </Suspense>
              ) : undefined
            }
          />
        </li>
      ))}
    </ol>
  );
}

export { EAGER_STILLS, EpisodeList };
