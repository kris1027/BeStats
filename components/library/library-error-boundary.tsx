"use client";

import { catchError, type ErrorInfo } from "next/error";

import { StatePanel } from "@/components/state-panel";
import { Button } from "@/components/ui/button";
import { LIBRARY_COPY } from "@/lib/tracking/messages";

import type { LibraryList } from "./types";

/**
 * The panel a library page shows when its section throws instead of
 * returning a panel of its own: an invalid `NEXT_PUBLIC_GAMES_LIBRARY` value
 * (spec 0027, AC-5), or any read that fails in a way the tabs do not settle.
 *
 * It wraps only the streamed section, so the heading stays in the static
 * shell and keeps the focus target removals rely on (spec 0008, AC-16). It
 * reads as `ListFailed` does, never as the empty state, which would tell the
 * user their list is gone, and never shows the error's message: a server
 * error reaches the client only as a digest anyway.
 *
 * `catchError` rather than a hand written boundary, because it lets the
 * section's `redirect()` (a page past the end, a lost session) pass through,
 * and its `retry()` fetches the section again from the server, where a plain
 * reset would replay the same error.
 */
function LibraryErrorFallback(
  { list }: { list: LibraryList },
  { retry }: ErrorInfo,
) {
  return (
    <div className="py-12">
      <StatePanel
        variant="error"
        title={LIBRARY_COPY[list].failed}
        description="Your list didn't load. Try again in a moment."
        action={
          <Button size="touch" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </div>
  );
}

const LibraryErrorBoundary = catchError(LibraryErrorFallback);

export { LibraryErrorBoundary };
