import type { Metadata } from "next";
import { Suspense } from "react";

import { LibraryHeading } from "@/components/library/library-heading";
import {
  UpcomingSections,
  UpcomingSkeleton,
} from "@/components/upcoming/upcoming-sections";

export const metadata: Metadata = {
  title: "Upcoming",
  robots: { index: false },
};

/**
 * The private Upcoming page: the next episode of every show the user is
 * Watching, then their planned movies not released yet (spec 0014, AC-1,
 * AC-2).
 *
 * The heading is the static shell. Everything that reads the session streams
 * behind one Suspense boundary, inside `UpcomingSections`, which calls
 * `requireUser()` itself: the proxy's redirect is only the convenience layer.
 */
export default function UpcomingPage() {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading>Upcoming</LibraryHeading>

      <Suspense fallback={<UpcomingSkeleton />}>
        <div className="flex flex-col gap-10">
          <UpcomingSections />
        </div>
      </Suspense>
    </div>
  );
}
