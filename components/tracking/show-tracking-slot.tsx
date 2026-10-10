import { cn } from "cn";

import { glassPillClassName } from "@/components/glass-pill";
import { RetryLink } from "@/components/retry-link";
import { SHOW_TRACKING_COPY } from "@/lib/tracking/messages";
import { getShowTracking } from "@/lib/tracking/show-state";

import { ShowTrackingControl } from "./show-tracking-control";

/**
 * The show hero's tracking place (spec 0020, AC-2): nothing for a visitor,
 * the tracking control for a signed in user, and a disabled "Tracking
 * unavailable" pill with Try again when the read fails.
 *
 * The failure never falls back to Plan to watch: a click on that could not
 * tell a tracked show from an untracked one. It reads the session, so the
 * page renders it inside its own Suspense boundary with a `null` fallback,
 * and it does not wait on the progress read below it (spec 0013, AC-11). It
 * writes nothing: no page writes on load (spec 0020, AC-21).
 *
 * @param showId The show, already confirmed by `loadShow`.
 * @param showName The TMDB name, for accessible names and toasts.
 */
async function ShowTrackingSlot({
  showId,
  showName,
}: {
  showId: number;
  showName: string;
}) {
  const result = await getShowTracking(showId);
  const returnPath = `/shows/${showId}`;

  if (result.kind === "signed_out") return null;

  if (result.kind === "failed") {
    return (
      <div
        data-slot="show-tracking-failed"
        className="flex flex-wrap items-center gap-3"
      >
        <button
          type="button"
          disabled
          className={cn(
            glassPillClassName(),
            "h-11 cursor-not-allowed px-4 text-text-secondary opacity-60 md:h-9 md:px-3.5",
          )}
        >
          {SHOW_TRACKING_COPY.unavailable}
        </button>
        <RetryLink href={returnPath} className="md:h-9" />
      </div>
    );
  }

  return (
    <ShowTrackingControl
      showId={showId}
      showName={showName}
      tracked={result.state}
      returnPath={returnPath}
    />
  );
}

export { ShowTrackingSlot };
