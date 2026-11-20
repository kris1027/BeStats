import type { EpisodeTrackingState } from "../tracking/types";

import { airStatus } from "./air-status";
import { type SeasonRatingResult, seasonRating } from "./ratings";

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

/**
 * A season's calculated rating over the episodes a page lists (spec 0012,
 * AC-5, AC-6; `AGENTS.md` section 9). Pages pass the states they show, pending
 * taps included, so a picked score moves the mean at once and rolls back with
 * it; an episode TMDB no longer lists stays out, as it does from the count
 * (spec 0011, AC-25). An id TMDB repeats counts once. Both apps call this,
 * so the season header reads the same number on the web and the phone.
 *
 * @param episodes The TMDB season's episodes.
 * @param states The shown states by episode id.
 */
export function listedSeasonRating(
  episodes: readonly Pick<SeasonEpisode, "id">[],
  states: Readonly<Record<number, EpisodeTrackingState>>,
): SeasonRatingResult | null {
  const ratings: number[] = [];
  const seen = new Set<number>();
  for (const { id } of episodes) {
    if (seen.has(id)) continue;
    seen.add(id);
    const rating = states[id]?.rating;
    if (rating != null) ratings.push(rating);
  }
  return seasonRating(ratings);
}
