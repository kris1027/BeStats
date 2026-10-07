import { cache } from "react";

import { GlassPill } from "@/components/glass-pill";
import { RetryLink } from "@/components/retry-link";
import { Skeleton } from "@/components/skeleton";
import { NextEpisodeIcon } from "@/components/tracking/tracking-icons";
import { typedHref } from "@/lib/catalog/media-type";
import { getSeason, TmdbError } from "@/lib/tmdb";
import {
  MARK_NEXT_MESSAGES,
  NEXT_EPISODE_MESSAGES,
} from "@/lib/tracking/messages";
import type { EpisodePlace } from "@/lib/tv/library-page";

import { MarkNextWatchedButton } from "./mark-next-watched-button";

/** The next episode's TMDB id and name, or `unavailable`. */
type NextEpisodeState =
  | { kind: "ok"; id: number; name: string | null }
  | { kind: "unavailable" };

/**
 * The TMDB id and name of a Watchlist card's next episode (spec 0020, AC-9),
 * from the cached `getSeason` read of its season, the public `hours` cache.
 *
 * `unavailable` when the read throws, or the season does not list the
 * episode classification named: the button needs the id, and no number from
 * a failed read is ever offered to mark. Wrapped in React `cache()` so the
 * controls and the caption decide from one read.
 */
const getNextEpisode = cache(
  async (
    showId: number,
    season: number,
    episode: number,
  ): Promise<NextEpisodeState> => {
    try {
      const detail = await getSeason(showId, season);
      const found = detail.episodes.find(
        (item) => item.episodeNumber === episode,
      );
      return found
        ? { kind: "ok", id: found.id, name: found.name }
        : { kind: "unavailable" };
    } catch (error) {
      if (!(error instanceof TmdbError)) throw error;
      return { kind: "unavailable" };
    }
  },
);

/** The "S1E3" pill, which the server already knows from classification. */
function NextEpisodePill({ next }: { next: EpisodePlace }) {
  return (
    <GlassPill
      data-slot="next-episode-pill"
      icon={<NextEpisodeIcon />}
      className="h-9 px-3 backdrop-blur-glass"
    >
      <span className="sr-only">
        {NEXT_EPISODE_MESSAGES.accessible(next.season, next.episode)}
      </span>
      <span aria-hidden="true">
        {NEXT_EPISODE_MESSAGES.pill(next.season, next.episode)}
      </span>
    </GlassPill>
  );
}

/**
 * The bottom row of a Watchlist show card: the next episode pill on the left
 * and the Mark watched button on the right (spec 0020, AC-9). It streams in
 * the card's own Suspense boundary, so the grid, posters and titles never
 * wait on any show's season read.
 *
 * A failed read shows the Up Next "unavailable" state, carried over
 * unchanged: no pill, no button, a Retry.
 *
 * @param showName The name the card shows, for the button's label and toast.
 */
async function WatchlistShowControls({
  showId,
  showName,
  next,
}: {
  showId: number;
  showName: string;
  next: EpisodePlace;
}) {
  const episode = await getNextEpisode(showId, next.season, next.episode);

  if (episode.kind === "unavailable") {
    return (
      <div
        data-slot="next-episode-unavailable"
        className="glass glass-rim glass-plate glass-shadow flex w-full flex-col items-start gap-1.5 rounded-2xl p-2 backdrop-blur-glass"
      >
        <span className="px-1 text-sm text-text-secondary">
          {MARK_NEXT_MESSAGES.unavailable}
        </span>
        <RetryLink href={typedHref("/watchlist", "tv")} className="md:h-9" />
      </div>
    );
  }

  return (
    <>
      <NextEpisodePill next={next} />
      <MarkNextWatchedButton
        showId={showId}
        showName={showName}
        seasonNumber={next.season}
        episodeNumber={next.episode}
        episodeId={episode.id}
      />
    </>
  );
}

/**
 * The next episode's name under the show name, once the season read lands
 * (AC-9). Nothing when TMDB has no name or the read failed: the controls say
 * so already.
 */
async function NextEpisodeName({
  showId,
  next,
}: {
  showId: number;
  next: EpisodePlace;
}) {
  const episode = await getNextEpisode(showId, next.season, next.episode);
  if (episode.kind !== "ok" || episode.name === null) return null;
  return <span className="text-sm text-text-secondary">{episode.name}</span>;
}

/**
 * The controls' stand in while the season read is on its way: the pill is
 * already known, and the button waits for the episode's id (AC-9).
 */
function WatchlistShowControlsPending({ next }: { next: EpisodePlace }) {
  return (
    <>
      <NextEpisodePill next={next} />
      <Skeleton shape="pill" className="ml-auto size-9 rounded-full" />
    </>
  );
}

export { NextEpisodeName, WatchlistShowControls, WatchlistShowControlsPending };
