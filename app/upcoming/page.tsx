import type { Metadata } from "next";
import { Suspense } from "react";

import { LibraryHeading } from "@/components/library/library-heading";
import {
  LibrarySection,
  LibrarySkeleton,
} from "@/components/library/library-section";

export const metadata: Metadata = {
  title: "Upcoming",
  robots: { index: false },
};

/**
 * The private Upcoming page: on the navbar's shows tab the tracked shows not
 * out yet and the ones caught up with a dated next episode, on its movies tab
 * the planned movies not released yet, soonest first with Date TBA last
 * (spec 0020, AC-11, AC-13, AC-15; feature 22). It has no Up Next section and
 * no Mark watched button.
 *
 * The heading and a skeleton grid are the static shell. Everything that reads
 * the session, the `type` and `page` parameters or the user's rows streams in
 * behind the Suspense boundary, inside `LibrarySection`, which calls
 * `requireUser()` itself: the proxy's redirect is only the convenience layer.
 * Nothing on this page writes when it loads (AC-21).
 */
export default function UpcomingPage({ searchParams }: PageProps<"/upcoming">) {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading>Upcoming</LibraryHeading>

      <Suspense fallback={<LibrarySkeleton />}>
        <LibrarySection list="upcoming" searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
