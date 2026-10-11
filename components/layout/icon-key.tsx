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
 * Every mark a card can carry, in one fixed order. The icons and meaning
 * colours are the badges' own, so the key can never drift from what the
 * cards show. Each two state mark is listed as a pair, action then done:
 * Plan and Planned, Mark watched and Watched.
 */
const ENTRIES: ReadonlyArray<{ label: string; icon: React.ReactNode }> = [
  {
    label: "TMDB rating",
    icon: <StarIcon className="size-4 fill-rating-tmdb text-rating-tmdb" />,
  },
  {
    label: "Your score",
    icon: (
      <StarIcon className="size-4 fill-score-personal text-score-personal" />
    ),
  },
  { label: "Plan", icon: <PlanIcon className="size-4" /> },
  { label: "Planned", icon: <PlannedIcon className="size-4" /> },
  {
    label: "Mark watched",
    icon: <WatchedIcon filled={false} className="size-4" />,
  },
  { label: "Watched", icon: <WatchedIcon filled className="size-4" /> },
  { label: "Next episode", icon: <NextEpisodeIcon className="size-4" /> },
  { label: "Release date", icon: <CalendarIcon className="size-4" /> },
];

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
    <div className="border-t border-border pt-6 pb-2">
      <ul
        aria-label="Icon key"
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-text-legend"
      >
        {ENTRIES.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="flex">
              {entry.icon}
            </span>
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
