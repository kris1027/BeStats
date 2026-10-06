import { PosterCard } from "@/components/poster-card";
import { CardRoundButton } from "@/components/tracking/card-round-button";
import { PlannedIcon } from "@/components/tracking/tracking-icons";
import { COMING_SOON_MESSAGES } from "@/lib/tracking/messages";

import { DatedPill } from "./dated-pill";

/**
 * One Coming soon movie, as the page hands it to `ComingSoonGrid` (spec 0014,
 * AC-11, AC-12). Plain data, because it crosses into a Client Component; the
 * dates are formatted on the server, which alone knows today.
 */
export type ComingSoonItem = {
  movieId: number;
  title: string;
  posterUrl: string | null;
  /** TMDB's `release_date`, always a known date after today in UTC. */
  releaseDate: string;
  /** `formatShortDate`, as the pill prints it. */
  shortDate: string;
  /** `formatAirDate`, for the pill's accessible text. */
  fullDate: string;
};

/**
 * One card in the Coming soon section (spec 0014, AC-12): the poster, the
 * calendar pill bottom left, the filled green Planned bookmark bottom right,
 * the title underneath, and no rating badge. The bookmark only reports the
 * tap: `ComingSoonGrid` owns the removal, its focus and its toast.
 */
function ComingSoonCard({
  item,
  onRemove,
  priority,
}: {
  item: ComingSoonItem;
  onRemove: () => void;
  priority: boolean;
}) {
  return (
    <PosterCard
      title={item.title}
      posterUrl={item.posterUrl}
      href={`/movies/${item.movieId}`}
      controls={
        <>
          <DatedPill
            slot="release-date"
            label={COMING_SOON_MESSAGES.releases(item.fullDate)}
            text={item.shortDate}
          />
          <CardRoundButton
            label={COMING_SOON_MESSAGES.remove(item.title)}
            onClick={onRemove}
            className="ml-auto"
          >
            <PlannedIcon className="size-4" />
          </CardRoundButton>
        </>
      }
      priority={priority}
    />
  );
}

export { ComingSoonCard };
