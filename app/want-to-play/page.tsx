import type { Metadata } from "next";
import { Suspense } from "react";

import { LibraryErrorBoundary } from "@/components/library/library-error-boundary";
import { LibraryHeading } from "@/components/library/library-heading";
import {
  LibrarySection,
  LibrarySkeleton,
} from "@/components/library/library-section";
import { libraryPageMetadata } from "@/lib/catalog/library-metadata";

export function generateMetadata({
  searchParams,
}: PageProps<"/want-to-play">): Promise<Metadata> {
  return libraryPageMetadata("/want-to-play", searchParams);
}

/**
 * The private Want to play page, the games tab's: the Want to play games
 * already out (spec 0027; prompts/game-coming-soon.md,
 * prompts/library-page-urls.md). Any other tab shows the "doesn't exist"
 * panel.
 *
 * The heading and a skeleton grid are the static shell; the heading's text
 * and the title are the page's name on the tab (`libraryPathName`).
 * Everything that reads the session, the `type` and `page` parameters or the
 * user's rows streams in behind the Suspense boundary, inside
 * `LibrarySection`, which calls `requireUser()` itself: the proxy's redirect
 * is only the convenience layer. A section that throws shows
 * `LibraryErrorBoundary`'s panel under the heading.
 *
 * `LibraryHeading` takes the focus when a removal empties the page (spec
 * 0008, AC-16). Nothing on this page writes when it loads (spec 0020, AC-21).
 */
export default function WantToPlayPage({
  searchParams,
}: PageProps<"/want-to-play">) {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading path="/want-to-play" />

      <LibraryErrorBoundary>
        <Suspense fallback={<LibrarySkeleton />}>
          <LibrarySection path="/want-to-play" searchParams={searchParams} />
        </Suspense>
      </LibraryErrorBoundary>
    </div>
  );
}
