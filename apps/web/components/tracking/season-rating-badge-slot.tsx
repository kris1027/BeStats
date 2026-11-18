import { CalculatedRatingBadge } from "@/components/rating-badges";
import { getShowEpisodeRatings } from "@/lib/tracking/show-ratings";
import { ratingsBySeason } from "@/lib/tv/ratings";

/**
 * A season card's calculated rating badge (spec 0012, AC-8).
 *
 * Shares the show page's one read through `cache()`. Renders nothing for a
 * season with no rating, for a visitor, and on a failed read, whose retry
 * line sits once beside the heading. `PosterCard`'s badge wrapper still
 * mounts around the empty result, but with no size or plate of its own it
 * shows nothing.
 */
async function SeasonRatingBadgeSlot({
  showId,
  seasonNumber,
}: {
  showId: number;
  seasonNumber: number;
}) {
  const result = await getShowEpisodeRatings(showId);
  if (result.kind !== "ok") return null;

  const season = ratingsBySeason(result.state).get(seasonNumber);
  if (!season) return null;

  return (
    <CalculatedRatingBadge value={season.mean} label="Your season rating" />
  );
}

export { SeasonRatingBadgeSlot };
