"use client";

import type { EpisodeStates } from "@/lib/tracking/episode-intent";
import { seasonRating } from "@/lib/tv/ratings";
import type { SeasonEpisode } from "@/lib/tv/season-watch";

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
  const ratings: number[] = [];
  const seen = new Set<number>();
  for (const { id } of episodes) {
    if (seen.has(id)) continue;
    seen.add(id);
    const rating = states[id]?.rating;
    if (rating != null) ratings.push(rating);
  }
  const result = seasonRating(ratings);

  return (
    <CalculatedRatingLine
      label="Your season rating"
      value={result?.mean ?? null}
      basis={
        result ? `from ${ratedCount(result.ratedEpisodes, "episode")}` : null
      }
    />
  );
}

export { SeasonRating };
