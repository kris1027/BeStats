"use client";

import type { EpisodeStates } from "@bestats/core/tracking/episode-intent";
import { SEASON_PAGE_COPY } from "@bestats/core/tracking/messages";
import {
  listedSeasonRating,
  type SeasonEpisode,
} from "@bestats/core/tv/season-watch";

import { CalculatedRatingLine, ratedCount } from "./calculated-rating-line";

/**
 * The season header's calculated rating (spec 0012, AC-5, AC-6).
 *
 * Takes the states the season button already shows, the confirmed ones with
 * every pending click replayed, so picking or clearing a score moves the
 * average in the same commit as the score pill and rolls back with it.
 *
 * Only the episodes this page lists count: the read behind the states is
 * filtered to them, so an episode TMDB no longer lists stays out here, as it
 * does from the count (spec 0011, AC-25).
 *
 * @param states The shown states, from `useEpisodeStates`.
 */
function SeasonRating({
  episodes,
  states,
}: {
  episodes: readonly SeasonEpisode[];
  states: EpisodeStates;
}) {
  const result = listedSeasonRating(episodes, states);

  return (
    <CalculatedRatingLine
      label={SEASON_PAGE_COPY.ratingLabel}
      value={result?.mean ?? null}
      basis={
        result ? `from ${ratedCount(result.ratedEpisodes, "episode")}` : null
      }
    />
  );
}

export { SeasonRating };
