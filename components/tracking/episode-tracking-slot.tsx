import { formatAirDate } from "@/lib/format";
import {
  getSeasonEpisodeTracking,
  requestTodayUtc,
} from "@/lib/tracking/episode-state";
import { EMPTY_EPISODE_TRACKING } from "@/lib/tracking/types";
import { airStatus } from "@/lib/tv/air-status";

import { EpisodeTrackingControls } from "./episode-tracking-controls";

/**
 * One episode row's tracking place (spec 0011, AC-1, AC-2, AC-4, AC-17).
 *
 * Nothing for a visitor, and nothing when the read failed (the header carries
 * the one retry line). Otherwise "Upcoming" for a future episode with nothing
 * stored, or the controls with the stored state, so the first paint is already
 * right. The read is shared with the header and every other row through the
 * season's `idsKey` (AC-18). Today is read only after the session read, never
 * in a cached scope, so the air status is always today's (AC-3).
 *
 * @param idsKey The whole season's ids, from `episodeIdsKey`; never this
 * row's own id, or each row would make its own query.
 */
async function EpisodeTrackingSlot({
  showId,
  idsKey,
  episode,
}: {
  showId: number;
  idsKey: string;
  episode: {
    id: number;
    episodeNumber: number;
    name: string | null;
    airDate: string | null;
  };
}) {
  const result = await getSeasonEpisodeTracking(showId, idsKey);
  if (result.kind !== "ok") return null;

  const stored = result.state[episode.id];
  const upcoming = airStatus(episode.airDate, requestTodayUtc()) === "upcoming";
  // Removals keep the row (AC-25), so an emptied row reads the same as no row.
  const hasState =
    stored !== undefined && (stored.watched || stored.rating !== null);

  if (upcoming && !hasState) {
    return (
      <p data-slot="episode-upcoming" className="text-sm text-text-secondary">
        Upcoming
      </p>
    );
  }

  return (
    <EpisodeTrackingControls
      episodeId={episode.id}
      label={episode.name ?? `Episode ${episode.episodeNumber}`}
      state={stored ?? EMPTY_EPISODE_TRACKING}
      upcoming={upcoming}
      airDate={formatAirDate(episode.airDate)}
    />
  );
}

export { EpisodeTrackingSlot };
