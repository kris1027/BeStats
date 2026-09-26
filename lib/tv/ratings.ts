/**
 * The calculated season and show ratings (spec 0012, `AGENTS.md` section 9).
 *
 * Pure on purpose: the season header replays pending clicks in the browser
 * and must reach the same number the server would, so the rule exists once
 * here and every surface calls it. Nothing is rounded in this module; the
 * means keep full precision and `formatCalculatedRating` rounds for display.
 */

/** The lowest season number that counts toward a show; 0 is Specials. */
export const REGULAR_SEASON_MIN = 1;

/** A season's personal rating and what it rests on. */
export type SeasonRatingResult = {
  /** The arithmetic mean of the rated episodes, unrounded. */
  mean: number;
  ratedEpisodes: number;
};

/** A show's personal rating and what it rests on. */
export type ShowRatingResult = {
  /** The equal weight mean of the rated regular seasons, or null for none. */
  mean: number | null;
  ratedSeasons: number;
  /** Whether Specials holds a rating, which the show mean leaves out. */
  specialsRated: boolean;
};

/** One stored episode rating, placed in its season. */
export type SeasonEpisodeRating = { seasonNumber: number; rating: number };

/**
 * A season's rating: the mean of the episodes the user rated (spec 0012,
 * AC-1). Callers pass only the ratings that exist, so an unrated episode is
 * excluded rather than counted as zero, and no ratings means "Not rated".
 *
 * @param ratings The integer scores of the season's rated episodes.
 */
export function seasonRating(
  ratings: readonly number[],
): SeasonRatingResult | null {
  if (ratings.length === 0) return null;
  let sum = 0;
  for (const rating of ratings) sum += rating;
  return { mean: sum / ratings.length, ratedEpisodes: ratings.length };
}

/**
 * Every rated season of a show, keyed by season number, from the stored rows
 * (spec 0012, AC-9). Seasons with no rating are simply absent.
 *
 * @param rows The user's rated episode rows for one show.
 */
export function ratingsBySeason(
  rows: readonly SeasonEpisodeRating[],
): Map<number, SeasonRatingResult> {
  const grouped = new Map<number, number[]>();
  for (const { seasonNumber, rating } of rows) {
    const list = grouped.get(seasonNumber);
    if (list) list.push(rating);
    else grouped.set(seasonNumber, [rating]);
  }

  const seasons = new Map<number, SeasonRatingResult>();
  for (const [seasonNumber, ratings] of grouped) {
    const result = seasonRating(ratings);
    if (result) seasons.set(seasonNumber, result);
  }
  return seasons;
}

/**
 * A show's rating: the mean of its rated regular seasons' means, each season
 * weighing exactly one however many episodes it has or the user rated
 * (spec 0012, AC-2). Specials never count; they only set `specialsRated`, so
 * the page can say why they are missing.
 *
 * @param seasons Each rated season's result, keyed by season number.
 */
export function showRating(
  seasons: ReadonlyMap<number, SeasonRatingResult>,
): ShowRatingResult {
  let sum = 0;
  let ratedSeasons = 0;
  for (const [seasonNumber, season] of seasons) {
    if (seasonNumber < REGULAR_SEASON_MIN) continue;
    sum += season.mean;
    ratedSeasons += 1;
  }
  return {
    mean: ratedSeasons === 0 ? null : sum / ratedSeasons,
    ratedSeasons,
    specialsRated: seasons.has(0),
  };
}
