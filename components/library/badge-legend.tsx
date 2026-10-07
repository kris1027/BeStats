import { StarIcon } from "lucide-react";

import {
  NextEpisodeIcon,
  PlannedIcon,
  StopWatchingIcon,
} from "@/components/tracking/tracking-icons";
import type { MediaType } from "@/lib/catalog/media-type";

/**
 * The key under a list page's grid: a hairline above, then each badge's
 * mark beside its name in the legend grey (spec 0008, AC-13).
 *
 * The marks reuse the badges' own icons and meaning colours, so the key can
 * never drift from what the cards show. Only the badges a page can actually
 * show are listed, in a fixed order: the watchlist's show tab adds Stop
 * watching and Next episode for its show cards (spec 0013, AC-17). Each
 * navbar tab lists only its own media type, so each has its own key
 * (feature 22).
 */
const TMDB_RATING = {
  label: "TMDB rating",
  icon: (
    <StarIcon
      className="size-4 fill-rating-tmdb text-rating-tmdb"
      aria-hidden="true"
    />
  ),
};
const PLANNED = { label: "Planned", icon: <PlannedIcon className="size-4" /> };
const YOUR_SCORE = {
  label: "Your score",
  icon: (
    <StarIcon
      className="size-4 fill-score-personal text-score-personal"
      aria-hidden="true"
    />
  ),
};

const ENTRIES = {
  watchlist: {
    movie: [TMDB_RATING, PLANNED],
    tv: [
      TMDB_RATING,
      PLANNED,
      { label: "Stop watching", icon: <StopWatchingIcon className="size-4" /> },
      { label: "Next episode", icon: <NextEpisodeIcon className="size-4" /> },
    ],
  },
  watched: { movie: [YOUR_SCORE], tv: [YOUR_SCORE] },
} as const;

function BadgeLegend({
  list,
  type,
}: {
  list: "watchlist" | "watched";
  type: MediaType;
}) {
  return (
    <div className="border-t border-border pt-6">
      <ul
        aria-label="Badge legend"
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-text-legend"
      >
        {ENTRIES[list][type].map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            {entry.icon}
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { BadgeLegend };
