import "server-only";
import { mapWithConcurrency } from "./concurrency";
import { TMDB_CONCURRENCY_LIMIT } from "./constants";
import { fetchSeason, fetchTvShow } from "./tv";
import type { Episode, SeasonDetail, ShowEpisodes, TvShow } from "./types";

/**
 * Every regular episode of one show, with an honest flag for whether the read
 * was complete.
 *
 * This is the read scope features 14, 15 and 16 stand on: progress, Up Next and
 * automatic completion all need every regular episode's air date across a whole
 * show, and no single TMDB endpoint returns that. Building it once here is what
 * stops each of those features fanning out over seasons on its own, uncapped.
 *
 * `complete` is the point of the function as much as the episodes are. A season
 * that failed to read leaves `complete` false and its number in
 * `failedSeasonNumbers`, so scope feature 16 can honour the AGENTS.md section 9
 * rule that a partial fetch must never establish completion. A failing season
 * does not raise, because a half read show is still worth rendering.
 *
 * Season 0 is excluded here and only here: specials sit outside overall TV
 * progress per AGENTS.md section 7, while `getSeason` still reads them happily.
 *
 * The readers are injected so the cached wrappers can pass their cached
 * versions (a season already fetched for a page is then not fetched again), and
 * so tests can drive the whole function without a network.
 *
 * @param showId TMDB show id.
 * @returns Every regular episode in season then episode order, plus `complete`.
 * @throws {TmdbError} `not_found` when the show itself does not exist. Only the
 * show read raises; season failures are reported, not thrown.
 */
export async function fetchShowEpisodes(
  showId: number,
  readers: {
    readTvShow?: (id: number) => Promise<TvShow>;
    readSeason?: (
      showId: number,
      seasonNumber: number,
    ) => Promise<SeasonDetail>;
  } = {},
): Promise<ShowEpisodes> {
  const readTvShow = readers.readTvShow ?? fetchTvShow;
  const readSeason = readers.readSeason ?? fetchSeason;

  const show = await readTvShow(showId);
  const regularSeasonNumbers = show.seasons
    .filter((season) => !season.isSpecials)
    .map((season) => season.seasonNumber)
    .sort((a, b) => a - b);

  const outcomes = await mapWithConcurrency(
    regularSeasonNumbers,
    TMDB_CONCURRENCY_LIMIT,
    async (seasonNumber) => {
      try {
        return await readSeason(showId, seasonNumber);
      } catch {
        return null;
      }
    },
  );

  const episodes: Episode[] = [];
  const failedSeasonNumbers: number[] = [];
  outcomes.forEach((season, index) => {
    if (season === null) {
      failedSeasonNumbers.push(regularSeasonNumbers[index]);
      return;
    }
    episodes.push(...season.episodes);
  });

  episodes.sort(
    (a, b) =>
      a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
  );

  return {
    episodes,
    complete: failedSeasonNumbers.length === 0,
    failedSeasonNumbers,
  };
}
