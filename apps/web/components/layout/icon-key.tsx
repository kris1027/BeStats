import {
  ICON_KEY_ENTRIES,
  ICON_KEY_LABEL,
  type IconKeyMark,
} from "@bestats/core/catalog/icon-key";
import { StarIcon } from "lucide-react";
import type * as React from "react";

import {
  CalendarIcon,
  NextEpisodeIcon,
  PlanIcon,
  PlannedIcon,
  WatchedIcon,
} from "@/components/tracking/tracking-icons";

/**
 * The icon for every mark core's `ICON_KEY_ENTRIES` lists, the badges' own
 * icons and meaning colours, so the key can never drift from what the cards
 * show. The words and the order live in core, shared with the app's About
 * (prompts/mobile-look-account.md, decision 6).
 */
const ICONS: Record<IconKeyMark, React.ReactNode> = {
  communityRating: (
    <StarIcon className="size-4 fill-rating-tmdb text-rating-tmdb" />
  ),
  personalScore: (
    <StarIcon className="size-4 fill-score-personal text-score-personal" />
  ),
  plan: <PlanIcon className="size-4" />,
  planned: <PlannedIcon className="size-4" />,
  markWatched: <WatchedIcon filled={false} className="size-4" />,
  watched: <WatchedIcon filled className="size-4" />,
  nextEpisode: <NextEpisodeIcon className="size-4" />,
  releaseDate: <CalendarIcon className="size-4" />,
};

/**
 * The key to the card marks, centred at the top of the footer on every route
 * (prompts/grid-tabs-footer-legend.md). It replaced the per tab legend under
 * the library grids: one key that always lists every mark is easier to find
 * than one that changes with the page, and it costs the grids no height.
 *
 * Static, with no request read, so the footer stays in every prerendered
 * shell (`app/layout-purity.test.ts`). The icons are decorative; each
 * entry's text names it.
 */
export function IconKey() {
  return (
    <div className="pt-6 pb-2">
      <ul
        aria-label={ICON_KEY_LABEL}
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-text-legend"
      >
        {ICON_KEY_ENTRIES.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="flex">
              {ICONS[entry.mark]}
            </span>
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
