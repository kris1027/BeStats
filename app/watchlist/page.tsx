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
 * The private Watchlist: on the navbar's shows tab the tracked shows with an
 * aired episode left to watch, each with its next episode and Mark watched,
 * and the Paused & dropped section below; on its movies tab the planned
 * movies already out (spec 0020, AC-9, AC-10, AC-13; feature 22).
 *
 * The heading and a skeleton grid are the static shell. Everything that reads
 * the session, the `type` and `page` parameters or the user's rows streams in
 * behind the Suspense boundary, inside `LibrarySection`, which calls
 * `requireUser()` itself: the proxy's redirect is only the convenience layer.
 *
 * `LibraryHeading` takes the focus when a removal empties the page (spec
 * 0008, AC-16). Nothing on this page writes when it loads (spec 0020, AC-21).
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
