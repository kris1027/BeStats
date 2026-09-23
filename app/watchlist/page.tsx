import type { Metadata } from "next";
import { Suspense } from "react";

import { LibraryHeading } from "@/components/library/library-heading";
import {
  LibrarySection,
  LibrarySkeleton,
} from "@/components/library/library-section";

export const metadata: Metadata = {
  title: "Watchlist",
  robots: { index: false },
};

/**
 * The private watchlist: the movies the user plans to watch, newest plan
 * first (spec 0008, AC-1, AC-3, AC-12).
 *
 * The heading and a skeleton grid are the static shell. Everything that reads
 * the session, the `page` parameter or the user's rows streams in behind the
 * Suspense boundary, inside `LibrarySection`, which calls `requireUser()`
 * itself: the proxy's redirect is only the convenience layer.
 *
 * `LibraryHeading` takes the focus when a removal empties the page (AC-16).
 */
export default function WatchlistPage({
  searchParams,
}: PageProps<"/watchlist">) {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading>Watchlist</LibraryHeading>

      <Suspense fallback={<LibrarySkeleton />}>
        <LibrarySection list="watchlist" searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
