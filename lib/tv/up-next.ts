import { airStatus } from "./air-status";
import {
  type NextEpisode,
  type ProgressEpisode,
  showProgress,
} from "./progress";

/** The first regular episode with a known date after today. */
export type UpcomingEpisode = {
  seasonNumber: number;
  episodeNumber: number;
  /** TMDB's `air_date`, `YYYY-MM-DD`, strictly after today in UTC. */
  airDate: string;
};

/**
 * What an Up Next card shows for one Watching show (spec 0014, AC-4).
 *
 * `next` is an episode to mark. `caught_up` means every aired regular episode
 * is watched; `not_aired` means none has aired yet. Both carry the next dated
 * episode when TMDB knows one, so the card can say when to come back.
 */
export type UpNextState =
  | { kind: "next"; episode: NextEpisode }
  | { kind: "caught_up"; upcoming: UpcomingEpisode | null }
  | { kind: "not_aired"; upcoming: UpcomingEpisode | null };

/**
 * The Up Next state of one show (spec 0014, AC-4).
 *
 * Built on `showProgress`, the one place the next episode rule lives, so Up
 * Next, the watchlist pill and the show hero can never disagree about which
 * episode comes next (`AGENTS.md` section 9). The only addition is the
 * upcoming episode: the first regular episode, in season then episode order,
 * whose `airStatus` is `upcoming`. A special or an undated episode is never
 * offered, because neither has a date the source confirms.
 *
 * @param episodes The show's episodes, from a complete `getShowEpisodes` read.
 * @param watchedEpisodeIds The user's watched episode ids for this show.
 * @param today `requestTodayUtc()`, read once per request, outside any cache.
 */
export function upNextState(
  episodes: readonly ProgressEpisode[],
  watchedEpisodeIds: ReadonlySet<number>,
  today: string,
): UpNextState {
  const progress = showProgress(episodes, watchedEpisodeIds, today);
  if (progress.kind === "counted" && progress.next !== null) {
    return { kind: "next", episode: progress.next };
  }

  const upcoming = firstUpcoming(episodes, today);
  return progress.kind === "none_aired"
    ? { kind: "not_aired", upcoming }
    : { kind: "caught_up", upcoming };
}

function firstUpcoming(
  episodes: readonly ProgressEpisode[],
  today: string,
): UpcomingEpisode | null {
  let first: UpcomingEpisode | null = null;
  for (const episode of episodes) {
    if (episode.seasonNumber < 1 || episode.airDate === null) continue;
    if (airStatus(episode.airDate, today) !== "upcoming") continue;
    if (
      first === null ||
      episode.seasonNumber < first.seasonNumber ||
      (episode.seasonNumber === first.seasonNumber &&
        episode.episodeNumber < first.episodeNumber)
    ) {
      first = {
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        airDate: episode.airDate,
      };
    }
  }
  return first;
}
