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
 * The private history: the movies the user has watched, most recent
 * first, with their own score (spec 0008, AC-2, AC-3, AC-12).
 *
 * The heading and a skeleton grid are the static shell. Everything that reads
 * the session, the `page` parameter or the user's rows streams in behind the
 * Suspense boundary, inside `LibrarySection`, which calls `requireUser()`
 * itself: the proxy's redirect is only the convenience layer.
 *
 * `LibraryHeading` takes the focus when a removal empties the page (AC-16).
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
