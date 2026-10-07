import { cache } from "react";

import { GlassPill } from "@/components/glass-pill";
import { RetryLink } from "@/components/retry-link";
import { Skeleton } from "@/components/skeleton";
import { NextEpisodeIcon } from "@/components/tracking/tracking-icons";
import { formatAirDate, formatShortDate } from "@/lib/format";
import { getShowEpisodes, TmdbError } from "@/lib/tmdb";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import {
  NEXT_EPISODE_MESSAGES,
  SHOW_PROGRESS_MESSAGES,
  UP_NEXT_MESSAGES,
} from "@/lib/tracking/messages";
import { getWatchedEpisodeIds } from "@/lib/tracking/show-state";
import { type UpNextState, upNextState } from "@/lib/tv/up-next";

import { DatedPill } from "./dated-pill";
import { upcomingHref } from "./ids";
import { MarkNextWatchedButton } from "./mark-next-watched-button";

/** A card's state, or `unavailable` when it may not show any number. */
type UpNextCardState = UpNextState | { kind: "unavailable" };

/**
 * One show's Up Next state for this request (spec 0014, AC-4, AC-7).
 *
 * `unavailable` when the watched ids read fails, or the TMDB episode read
 * throws or is incomplete: a partial read could name an episode the user
 * already watched, so no number or date from it is ever shown. Wrapped in
 * React `cache()` so the pill, the button and the caption decide from one
 * read. The TMDB read is the public `hours` cache; the watched ids (one read
 * for the whole section, through `watchedIdsKey`) and today are per request
 * (AC-15).
 */
const getUpNextCardState = cache(
  async (showId: number, watchedIdsKey: string): Promise<UpNextCardState> => {
    const watched = await getWatchedEpisodeIds(watchedIdsKey);
    if (watched.kind !== "ok") return { kind: "unavailable" };

    let episodes: Awaited<ReturnType<typeof getShowEpisodes>>;
    try {
      episodes = await getShowEpisodes(showId);
    } catch (error) {
      if (!(error instanceof TmdbError)) throw error;
      return { kind: "unavailable" };
    }
    if (!episodes.complete) return { kind: "unavailable" };

    return upNextState(
      episodes.episodes,
      watched.state.get(showId) ?? new Set(),
      requestTodayUtc(),
    );
  },
);

/**
 * The bottom row of an Up Next card: the pill on the left and, for an episode
 * to watch, the Mark watched button on the right (spec 0014, AC-5, AC-7,
 * AC-8). It streams in the card's own Suspense boundary, so the section,
 * posters and titles never wait on any show's episodes (AC-6).
 *
 * @param showName The name the card shows, for the button's label and toast.
 * @param watchedIdsKey Every Up Next show id, from `showIdsKey`.
 */
async function UpNextControls({
  showId,
  showName,
  watchedIdsKey,
}: {
  showId: number;
  showName: string;
  watchedIdsKey: string;
}) {
  const state = await getUpNextCardState(showId, watchedIdsKey);

  if (state.kind === "unavailable") {
    return (
      <div
        data-slot="up-next-unavailable"
        className="glass glass-rim glass-plate glass-shadow flex w-full flex-col items-start gap-1.5 rounded-2xl p-2 backdrop-blur-glass"
      >
        <span className="px-1 text-sm text-text-secondary">
          {UP_NEXT_MESSAGES.unavailable}
        </span>
        <RetryLink href={upcomingHref("tv")} className="md:h-9" />
      </div>
    );
  }

  if (state.kind === "next") {
    const { episode } = state;
    return (
      <>
        <GlassPill
          data-slot="up-next-pill"
          icon={<NextEpisodeIcon />}
          className="h-9 px-3 backdrop-blur-glass"
        >
          <span className="sr-only">
            {NEXT_EPISODE_MESSAGES.accessible(
              episode.seasonNumber,
              episode.episodeNumber,
            )}
          </span>
          <span aria-hidden="true">
            {NEXT_EPISODE_MESSAGES.pill(
              episode.seasonNumber,
              episode.episodeNumber,
            )}
          </span>
        </GlassPill>
        <MarkNextWatchedButton
          showId={showId}
          showName={showName}
          seasonNumber={episode.seasonNumber}
          episodeNumber={episode.episodeNumber}
          episodeId={episode.id}
        />
      </>
    );
  }

  const { upcoming } = state;
  if (upcoming === null) {
    if (state.kind === "not_aired") return null;
    return (
      <GlassPill
        data-slot="up-next-pill"
        icon={<NextEpisodeIcon />}
        className="h-9 px-3 backdrop-blur-glass"
      >
        {NEXT_EPISODE_MESSAGES.upToDate}
      </GlassPill>
    );
  }

  const today = requestTodayUtc();
  const fullDate = formatAirDate(upcoming.airDate) ?? upcoming.airDate;
  const shortDate = formatShortDate(upcoming.airDate, today) ?? fullDate;
  const accessible =
    state.kind === "caught_up"
      ? UP_NEXT_MESSAGES.nextAirs(
          upcoming.seasonNumber,
          upcoming.episodeNumber,
          fullDate,
        )
      : UP_NEXT_MESSAGES.firstAirs(
          upcoming.seasonNumber,
          upcoming.episodeNumber,
          fullDate,
        );

  return (
    <DatedPill
      slot="up-next-pill"
      label={accessible}
      text={UP_NEXT_MESSAGES.datedPill(
        upcoming.seasonNumber,
        upcoming.episodeNumber,
        shortDate,
      )}
    />
  );
}

/**
 * The secondary line under the show name (spec 0014, AC-5). "You're up to
 * date" for a caught up show (the `AGENTS.md` section 9 wording, always
 * visible). A show with nothing aired and no dated episode has no pill, so
 * it says so here, in the show page's progress wording, rather than leaving
 * a bare poster (`AGENTS.md` section 9, a sensible empty state). Decided by
 * the same cached read as the pill, so the two can never disagree.
 */
async function UpNextCaption({
  showId,
  watchedIdsKey,
}: {
  showId: number;
  watchedIdsKey: string;
}) {
  const state = await getUpNextCardState(showId, watchedIdsKey);
  const caption =
    state.kind === "caught_up"
      ? UP_NEXT_MESSAGES.caughtUp
      : state.kind === "not_aired" && state.upcoming === null
        ? SHOW_PROGRESS_MESSAGES.noneAired
        : null;
  if (caption === null) return null;
  return <span className="text-sm text-text-secondary">{caption}</span>;
}

/** The pill's stand in while a card's episodes load (AC-6). */
function UpNextPillSkeleton() {
  return <Skeleton shape="pill" className="h-9 w-20" />;
}

export { UpNextCaption, UpNextControls, UpNextPillSkeleton };
