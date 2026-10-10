"use client";

import { cn } from "cn";

import { glassPillClassName } from "@/components/glass-pill";
import { SHOW_TRACKING_COPY } from "@/lib/tracking/messages";

import { PlanIcon, PlannedIcon } from "./tracking-icons";
import { useShowTrackingToggle } from "./use-show-tracking";

/** The pill recipe at the touch sizes: 44px on mobile, 36px from `md`. */
const PILL =
  "h-11 cursor-pointer px-4 transition-[filter] hover:brightness-125 md:h-9 md:px-3.5";

/**
 * The show hero's tracking toggle (spec 0020, AC-2 to AC-4, amended
 * 2026-10-10).
 *
 * An untracked show reads Plan to watch, and a click tracks it. A tracked
 * one reads Tracking beside the filled Planned bookmark, the mark the card
 * bookmark shows, and a click stops tracking with a toast that carries the
 * Undo. There is no menu: Stop tracking is the only way off the pages. The
 * accessible name says what the click will do, as the card bookmark's does,
 * since the two states act differently.
 *
 * The state is optimistic, as the movie pills are, through
 * `useShowTrackingToggle`, the hook the card bookmark shares.
 *
 * @param showName The TMDB name, for the accessible name and the toasts.
 * @param returnPath Where the session expired toast's Sign in comes back to.
 */
function ShowTrackingControl({
  showId,
  showName,
  tracked,
  returnPath,
}: {
  showId: number;
  showName: string;
  tracked: boolean;
  returnPath: string;
}) {
  const { shown, toggle } = useShowTrackingToggle(tracked, {
    showId,
    showName,
    returnPath,
    toastId: `show-tracking-${showId}`,
  });

  return (
    <div data-slot="show-tracking" className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-label={
          shown
            ? SHOW_TRACKING_COPY.stopLabel(showName)
            : `${SHOW_TRACKING_COPY.plan}: ${showName}`
        }
        className={cn(glassPillClassName(), PILL)}
        onClick={toggle}
      >
        {shown ? <PlannedIcon /> : <PlanIcon />}
        <span aria-hidden="true">
          {shown ? SHOW_TRACKING_COPY.tracking : SHOW_TRACKING_COPY.plan}
        </span>
      </button>
    </div>
  );
}

export { ShowTrackingControl };
