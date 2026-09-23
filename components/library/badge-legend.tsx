import { StarIcon } from "lucide-react";

import { PlannedIcon } from "@/components/tracking/tracking-icons";

/**
 * The key under a list page's grid, per `badge-legend` in
 * `design/desktop-watchlist-page.svg`: a hairline above, then each badge's
 * mark beside its name in the legend grey (spec 0008, AC-13).
 *
 * The marks reuse the badges' own icons and meaning colours, so the key can
 * never drift from what the cards show. Only the badges a page can actually
 * show are listed: the artboard's Stop watching and Next episode belong to TV
 * entries, which arrive with feature 14.
 */
const ENTRIES = {
  watchlist: [
    {
      label: "TMDB rating",
      icon: (
        <StarIcon
          className="size-4 fill-rating-tmdb text-rating-tmdb"
          aria-hidden="true"
        />
      ),
    },
    { label: "Planned", icon: <PlannedIcon className="size-4" /> },
  ],
  watched: [
    {
      label: "Your score",
      icon: (
        <StarIcon
          className="size-4 fill-score-personal text-score-personal"
          aria-hidden="true"
        />
      ),
    },
  ],
} as const;

function BadgeLegend({ list }: { list: "watchlist" | "watched" }) {
  return (
    <div className="border-t border-border pt-6">
      <ul
        aria-label="Badge legend"
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-text-legend"
      >
        {ENTRIES[list].map((entry) => (
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
