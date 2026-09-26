import { RetryLink } from "@/components/retry-link";
import { TRACKING_READ_FAILED } from "@/lib/tracking/messages";
import { getShowEpisodeRatings } from "@/lib/tracking/show-ratings";
import { ratingsBySeason, showRating } from "@/lib/tv/ratings";

import { CalculatedRatingLine, ratedCount } from "./calculated-rating-line";

/** Said whenever Specials hold a rating the show mean leaves out. */
const SPECIALS_NOTE = "Specials not included";

/**
 * The show rating beside the Seasons heading (spec 0012, AC-7, AC-10, AC-11).
 *
 * Nothing for a visitor. The one retry line for the page when the read
 * fails, since the season cards then show no badge either. Otherwise "Your
 * show rating", the equal weight mean of the rated regular seasons, with what
 * it rests on, and a note when rated Specials were left out.
 */
async function ShowRatingSlot({ showId }: { showId: number }) {
  const result = await getShowEpisodeRatings(showId);

  if (result.kind === "signed_out") return null;

  if (result.kind === "failed") {
    return (
      <div
        data-slot="show-rating-failed"
        className="flex flex-wrap items-center gap-3"
      >
        <p className="text-sm text-muted-foreground">{TRACKING_READ_FAILED}</p>
        <RetryLink href={`/shows/${showId}`} className="md:h-9" />
      </div>
    );
  }

  const show = showRating(ratingsBySeason(result.state));
  const parts: string[] = [];
  if (show.mean !== null)
    parts.push(`from ${ratedCount(show.ratedSeasons, "season")}`);
  if (show.specialsRated) parts.push(SPECIALS_NOTE);

  return (
    <CalculatedRatingLine
      label="Your show rating"
      value={show.mean}
      basis={parts.length === 0 ? null : parts.join(" · ")}
    />
  );
}

export { ShowRatingSlot };
