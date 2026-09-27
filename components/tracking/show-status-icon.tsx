import type { TvStatus } from "@/lib/tracking/types";

import {
  CompletedIcon,
  DroppedIcon,
  NextEpisodeIcon,
  PlanIcon,
  PlannedIcon,
  StopWatchingIcon,
} from "./tracking-icons";

/**
 * The glyph for each status on the show pill and in its menu (spec 0013,
 * Feature design). Want to Watch is the Planned bookmark because it is the
 * TV watchlist state, the same mark the watchlist card wears; On Hold is the
 * Stop watching mark because that button sets it. No row is the outline Plan
 * bookmark. Decorative: the label beside it carries the meaning.
 */
function ShowStatusIcon({
  status,
  className,
}: {
  status: TvStatus | null;
  className?: string;
}) {
  switch (status) {
    case null:
      return <PlanIcon className={className} />;
    case "want_to_watch":
      return <PlannedIcon className={className} />;
    case "watching":
      return <NextEpisodeIcon className={className} />;
    case "on_hold":
      return <StopWatchingIcon className={className} />;
    case "dropped":
      return <DroppedIcon className={className} />;
    case "completed":
      return <CompletedIcon className={className} />;
  }
}

export { ShowStatusIcon };
