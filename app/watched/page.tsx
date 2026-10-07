import type { Metadata } from "next";
import { Suspense } from "react";

import { LibraryHeading } from "@/components/library/library-heading";
import {
  LibrarySection,
  LibrarySkeleton,
} from "@/components/library/library-section";

export const metadata: Metadata = {
  title: "Watched",
  robots: { index: false },
};

/**
 * The private history: the movies the user has watched, or the tracked shows
 * they are caught up on with nothing dated, labelled Finished or Caught up,
 * by the navbar tab's `type`, most recent first, with their own score or
 * calculated show rating (spec 0008, AC-2; spec 0019, AC-5; spec 0020,
 * AC-12; feature 22).
 *
 * The heading and a skeleton grid are the static shell. Everything that reads
 * the session, the `type` and `page` parameters or the user's rows streams in
 * behind the Suspense boundary, inside `LibrarySection`, which calls
 * `requireUser()` itself: the proxy's redirect is only the convenience layer.
 *
 * `LibraryHeading` takes the focus when a removal empties the page (spec
 * 0008, AC-16). Nothing on this page writes when it loads (spec 0020, AC-21).
 */
export default function WatchedPage({ searchParams }: PageProps<"/watched">) {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading>Watched</LibraryHeading>

      <Suspense fallback={<LibrarySkeleton />}>
        <LibrarySection list="watched" searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
