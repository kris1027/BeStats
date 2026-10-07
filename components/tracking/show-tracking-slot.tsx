import { cn } from "cn";

import { glassPillClassName } from "@/components/glass-pill";
import { RetryLink } from "@/components/retry-link";
import { getReconciledShowStatus } from "@/lib/tracking/auto-completion";
import { SHOW_STATUS_MESSAGES } from "@/lib/tracking/messages";

import { ShowStatusControl } from "./show-status-control";

/**
 * The show hero's status place (spec 0013, AC-1, AC-5): nothing for a
 * visitor, the status pill for a signed in user, and a disabled "Status
 * unavailable" pill with Try again when the read fails.
 *
 * The failure never falls back to "Add to my shows": a click on that could
 * overwrite a status the page simply failed to read. It reads the session,
 * so the page renders it inside its own Suspense boundary with a `null`
 * fallback, and it does not wait on the progress read below it (AC-11),
 * except for a row the system set: then the automatic completion check runs
 * first and the pill shows its result (spec 0015, AC-10, narrowing AC-11).
 *
 * @param showId The show, already confirmed by `loadShow`.
 * @param showName The TMDB name, for accessible names and toasts.
 */
async function ShowStatusSlot({
  showId,
  showName,
}: {
  showId: number;
  showName: string;
}) {
  const result = await getReconciledShowStatus(showId);
  const returnPath = `/shows/${showId}`;

  if (result.kind === "signed_out") return null;

  if (result.kind === "failed") {
    return (
      <div
        data-slot="show-status-failed"
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
          {SHOW_STATUS_MESSAGES.unavailable}
        </button>
        <RetryLink href={returnPath} className="md:h-9" />
      </div>
    );
  }

  return (
    <ShowStatusControl
      showId={showId}
      showName={showName}
      state={result.state}
      returnPath={returnPath}
    />
  );
}

export { ShowStatusSlot };
