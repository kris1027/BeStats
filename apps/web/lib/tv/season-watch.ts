import type { EpisodeTrackingState } from "@/lib/tracking/types";

import { airStatus } from "./air-status";

/** The episode fields the season rules read. */
export type SeasonEpisode = {
  id: number;
  episodeNumber: number;
  airDate: string | null;
};

/**
 * The season header's state (spec 0011, AC-8). Derived every render, never
 * stored: nothing about a season is persisted (`AGENTS.md` section 8).
 */
export type SeasonWatchState =
  | "none_aired"
  | "partly_watched"
  | "season_watched";

export type SeasonWatchSummary = {
  /** Episodes of this season whose air status is `aired`. */
  aired: number;
  /** How many of those are watched. */
  watchedAired: number;
  state: SeasonWatchState;
};

/**
 * The count and button state the season header shows.
 *
 * Only `aired` episodes are in either number. An `unknown` or `upcoming`
 * episode marked one at a time is still watched, but counting it would let
 * "10 of 10" mean different things on different shows (spec 0011, AC-8).
 * An id TMDB repeats is counted once.
 *
 * @param episodes The TMDB season's episodes.
 * @param states The stored states by episode id; a missing id is unwatched.
 * @param today The result of `todayUtc`, from the server.
 */
export function seasonWatchSummary(
  episodes: readonly SeasonEpisode[],
  states: Readonly<Record<number, EpisodeTrackingState>>,
  today: string,
): SeasonWatchSummary {
  const airedIds = new Set(
    episodes
      .filter((episode) => airStatus(episode.airDate, today) === "aired")
      .map((episode) => episode.id),
  );
  let watchedAired = 0;
  for (const id of airedIds) {
    if (states[id]?.watched) watchedAired += 1;
  }

  const aired = airedIds.size;
  const state: SeasonWatchState =
    aired === 0
      ? "none_aired"
      : watchedAired === aired
        ? "season_watched"
        : "partly_watched";
  return { aired, watchedAired, state };
}

/**
 * The episodes "Mark season watched" writes: every `aired` one, each id once
 * (spec 0011, AC-9).
 *
 * A repeated id keeps its lowest episode number, which is what the
 * `distinct on` in `mark_season_watched` keeps too, so the client's guess and
 * the stored row agree even on malformed TMDB data.
 *
 * @param episodes The TMDB season's episodes.
 * @param today The result of `todayUtc`.
 * @returns Parallel arrays, sorted by id, ready for the function's arguments.
 */
export function airedEpisodesForMarking(
  episodes: readonly SeasonEpisode[],
  today: string,
): { ids: number[]; numbers: number[] } {
  const byId = new Map<number, number>();
  for (const episode of episodes) {
    if (airStatus(episode.airDate, today) !== "aired") continue;
    const known = byId.get(episode.id);
    if (known === undefined || episode.episodeNumber < known) {
      byId.set(episode.id, episode.episodeNumber);
    }
  }
  const ids = [...byId.keys()].sort((a, b) => a - b);
  return { ids, numbers: ids.map((id) => byId.get(id) as number) };
}
