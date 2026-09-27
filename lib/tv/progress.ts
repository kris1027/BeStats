import { airStatus } from "./air-status";

/**
 * The fields of a TMDB episode that progress reads. `getShowEpisodes`
 * returns full `Episode` objects, which satisfy this shape.
 */
export type ProgressEpisode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  airDate: string | null;
};

/** The first eligible episode still to watch, as the Next episode pill shows it. */
export type NextEpisode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
};

/**
 * A show's progress (spec 0013, AC-9). `none_aired` is its own answer, never
 * a count of zero: nothing aired means nothing to be behind on, not 0%, and
 * never "complete" (`AGENTS.md` section 9).
 */
export type ShowProgress =
  | { kind: "none_aired" }
  | {
      kind: "counted";
      /** Eligible episodes whose id is in the watched set. */
      watched: number;
      /** Eligible episodes: aired, regular season. Always at least 1. */
      total: number;
      /** The first eligible episode not watched, or null when caught up. */
      next: NextEpisode | null;
    };

/**
 * Progress through a show: watched out of aired regular episodes, and the
 * next one to watch. The one place this rule exists; the show hero, the
 * watchlist's Next episode pill, and later Up Next (feature 15) and automatic
 * completion (feature 16) all call it.
 *
 * Eligible means a regular season episode whose `airStatus` is `aired`, the
 * spec 0011 UTC calendar date rule, unchanged. An upcoming episode, one with
 * no date, and every special (season 0) are left out of both numbers, so a
 * watched special or a watched future episode can never inflate `watched`,
 * and `watched` can never exceed `total`. Watched state is matched by TMDB
 * episode id, so a renumbered episode still counts once.
 *
 * `getShowEpisodes` already leaves specials out and sorts by season then
 * episode; both are applied again here so the rule holds for any caller.
 *
 * @param episodes The show's episodes, from `getShowEpisodes(...).episodes`.
 * @param watchedEpisodeIds The user's watched episode ids for this show.
 * @param today `requestTodayUtc()`, read once per request, outside any cache.
 */
export function showProgress(
  episodes: readonly ProgressEpisode[],
  watchedEpisodeIds: ReadonlySet<number>,
  today: string,
): ShowProgress {
  const eligible = episodes
    .filter(
      (episode) =>
        episode.seasonNumber >= 1 &&
        airStatus(episode.airDate, today) === "aired",
    )
    .sort(
      (a, b) =>
        a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
    );

  if (eligible.length === 0) return { kind: "none_aired" };

  // One entry per id, so an id TMDB listed twice counts once on both sides.
  const seen = new Set<number>();
  let watched = 0;
  let total = 0;
  let next: NextEpisode | null = null;
  for (const episode of eligible) {
    if (seen.has(episode.id)) continue;
    seen.add(episode.id);
    total += 1;
    if (watchedEpisodeIds.has(episode.id)) {
      watched += 1;
    } else if (next === null) {
      next = {
        id: episode.id,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
      };
    }
  }

  return { kind: "counted", watched, total, next };
}
