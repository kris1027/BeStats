import { StarIcon } from "lucide-react";

import {
  CalendarIcon,
  NextEpisodeIcon,
  PlannedIcon,
  WatchedIcon,
} from "@/components/tracking/tracking-icons";
import type { MediaType } from "@/lib/catalog/media-type";

import type { LibraryList } from "./types";

/**
 * The key under a library page's grid: a hairline above, then each badge's
 * mark beside its name in the legend grey (spec 0008, AC-13).
 *
 * The marks reuse the badges' own icons and meaning colours, so the key can
 * never drift from what the cards show. Only the badges a tab can actually
 * show are listed, in a fixed order: each page and navbar tab has its own
 * cards (spec 0020, AC-9, AC-11 to AC-13; feature 22), so each has its own
 * key.
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
const NEXT_EPISODE = {
  label: "Next episode",
  icon: <NextEpisodeIcon className="size-4" />,
};
const MARK_WATCHED = {
  label: "Mark watched",
  icon: <WatchedIcon filled={false} className="size-4" />,
};

const ENTRIES = {
  watchlist: {
    movie: [TMDB_RATING, PLANNED],
    tv: [NEXT_EPISODE, MARK_WATCHED],
  },
  upcoming: {
    movie: [
      { label: "Release date", icon: <CalendarIcon className="size-4" /> },
      PLANNED,
    ],
    tv: [{ label: "Air date", icon: <CalendarIcon className="size-4" /> }],
  },
  watched: { movie: [YOUR_SCORE], tv: [YOUR_SCORE] },
} as const;

function BadgeLegend({ list, type }: { list: LibraryList; type: MediaType }) {
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
