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
}: PageProps<"/watched">): Promise<Metadata> {
  return libraryPageMetadata("/watched", searchParams);
}

/**
 * The private history, shared by the shows and movies tabs: the movies the
 * user has watched, or the tracked shows they are caught up on with nothing
 * dated, labelled Finished or Caught up, most recent first, with their own
 * score or calculated show rating (spec 0008, AC-2; spec 0019, AC-5; spec
 * 0020, AC-12; feature 22). Games have Finished instead
 * (prompts/library-page-urls.md), so they show the "doesn't exist" panel.
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
export default function WatchedPage({ searchParams }: PageProps<"/watched">) {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading path="/watched" />

      <LibraryErrorBoundary>
        <Suspense fallback={<LibrarySkeleton />}>
          <LibrarySection path="/watched" searchParams={searchParams} />
        </Suspense>
      </LibraryErrorBoundary>
    </div>
  );
}
