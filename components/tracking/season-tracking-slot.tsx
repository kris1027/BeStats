import { RetryLink } from "@/components/retry-link";
import {
  getSeasonEpisodeTracking,
  requestTodayUtc,
} from "@/lib/tracking/episode-state";
import { TRACKING_READ_FAILED } from "@/lib/tracking/messages";
import type { SeasonEpisode } from "@/lib/tv/season-watch";

import { SeasonWatchedControl } from "./season-watched-control";

/**
 * The season header's tracking place (spec 0011, AC-4, AC-8, AC-17).
 *
 * Nothing for a visitor. The one retry line for the whole page when the read
 * fails, while the catalog content renders as usual. Otherwise the season
 * button and count, given the season's episodes and the server's today so the
 * client computes the same aired set the action will write.
 *
 * @param idsKey The whole season's ids, the same key every row uses.
 */
async function SeasonTrackingSlot({
  showId,
  seasonNumber,
  seasonName,
  idsKey,
  episodes,
}: {
  showId: number;
  seasonNumber: number;
  seasonName: string;
  idsKey: string;
  episodes: SeasonEpisode[];
}) {
  const result = await getSeasonEpisodeTracking(showId, idsKey);

  if (result.kind === "signed_out") return null;

  if (result.kind === "failed") {
    return (
      <div
        data-slot="season-tracking-failed"
        className="flex flex-wrap items-center gap-3"
      >
        <p className="text-sm text-muted-foreground">{TRACKING_READ_FAILED}</p>
        <RetryLink
          href={`/shows/${showId}/season/${seasonNumber}`}
          className="md:h-9"
        />
      </div>
    );
  }

  return (
    <SeasonWatchedControl
      seasonName={seasonName}
      episodes={episodes}
      states={result.state}
      today={requestTodayUtc()}
    />
  );
}

export { SeasonTrackingSlot };
