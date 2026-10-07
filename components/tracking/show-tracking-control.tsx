"use client";

import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";
import { useOptimistic } from "react";

import { glassPillClassName } from "@/components/glass-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SHOW_TRACKING_COPY,
  SHOW_TRACKING_LABELS,
} from "@/lib/tracking/messages";
import type { ShowHold, ShowTrackingState } from "@/lib/tracking/types";

import {
  DroppedIcon,
  PlanIcon,
  PlannedIcon,
  StopWatchingIcon,
} from "./tracking-icons";
import { useShowTracking } from "./use-show-tracking";

/** The pill recipe at the touch sizes: 44px on mobile, 36px from `md`. */
const PILL =
  "h-11 cursor-pointer px-4 transition-[filter] hover:brightness-125 md:h-9 md:px-3.5";

/**
 * The glyph beside each state (spec 0020, AC-2). Tracking wears the filled
 * Planned bookmark, the same mark the card bookmark shows for a tracked
 * show; a pause the Stop watching mark; a drop the Dropped mark. Decorative:
 * the label beside it carries the meaning.
 */
function TrackingIcon({
  hold,
  className,
}: {
  hold: ShowHold | null;
  className?: string;
}) {
  if (hold === "paused") return <StopWatchingIcon className={className} />;
  if (hold === "dropped") return <DroppedIcon className={className} />;
  return <PlannedIcon className={className} />;
}

/**
 * The show hero's tracking control (spec 0020, AC-2 to AC-4).
 *
 * An untracked show offers Plan to watch, which tracks it. A tracked one
 * shows a pill reading Tracking, Paused or Dropped, with a menu: Pause, Drop
 * and Stop tracking with no hold; Resume, the other hold and Stop tracking
 * when held. Stop tracking confirms with a toast that carries the Undo.
 *
 * The state is optimistic, as the movie pills are: it changes at once and
 * lasts while the action runs, then gives way to the prop `refresh()`
 * delivers, or, on failure, to the unchanged prop, which is the rollback.
 * Every write names the hold this pill showed, so a stale pill refreshes
 * instead of overwriting a change made elsewhere (AC-4).
 *
 * @param showName The TMDB name, for the accessible name and the toasts.
 * @param returnPath Where the session expired toast's Sign in comes back to.
 */
function ShowTrackingControl({
  showId,
  showName,
  state,
  returnPath,
}: {
  showId: number;
  showName: string;
  state: ShowTrackingState | null;
  returnPath: string;
}) {
  const [shown, setShown] = useOptimistic(state);
  const tracking = useShowTracking({
    showId,
    showName,
    returnPath,
    toastId: `show-tracking-${showId}`,
  });

  if (shown === null) {
    return (
      <div data-slot="show-tracking" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-label={`${SHOW_TRACKING_COPY.plan}: ${showName}`}
          className={cn(glassPillClassName(), PILL)}
          onClick={() =>
            tracking.track({ before: () => setShown({ hold: null }) })
          }
        >
          <PlanIcon />
          <span aria-hidden="true">{SHOW_TRACKING_COPY.plan}</span>
        </button>
      </div>
    );
  }

  const expected = shown.hold;
  function hold(target: ShowHold | null) {
    tracking.setHold(target, expected, {
      before: () => setShown({ hold: target }),
    });
  }
  function stop() {
    tracking.untrack(expected, {
      before: () => setShown(null),
      restoring: () => setShown({ hold: expected }),
    });
  }

  const label = SHOW_TRACKING_LABELS[shown.hold ?? "none"];
  return (
    <div data-slot="show-tracking" className="flex flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${label}, tracking for ${showName}`}
          className={cn(glassPillClassName(), PILL)}
        >
          <TrackingIcon hold={shown.hold} />
          <span aria-hidden="true">{label}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-3.5 text-text-secondary"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label={SHOW_TRACKING_COPY.menuLabel}>
          {shown.hold === null ? (
            <>
              <DropdownMenuItem onClick={() => hold("paused")}>
                <StopWatchingIcon className="size-4" />
                {SHOW_TRACKING_COPY.pause}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => hold("dropped")}>
                <DroppedIcon className="size-4" />
                {SHOW_TRACKING_COPY.drop}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={() => hold(null)}>
                <PlannedIcon className="size-4" />
                {SHOW_TRACKING_COPY.resume}
              </DropdownMenuItem>
              {shown.hold === "paused" ? (
                <DropdownMenuItem onClick={() => hold("dropped")}>
                  <DroppedIcon className="size-4" />
                  {SHOW_TRACKING_COPY.drop}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => hold("paused")}>
                  <StopWatchingIcon className="size-4" />
                  {SHOW_TRACKING_COPY.pause}
                </DropdownMenuItem>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={stop}>
            {SHOW_TRACKING_COPY.stop}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { ShowTrackingControl };
