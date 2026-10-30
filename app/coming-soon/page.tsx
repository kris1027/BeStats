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
}: PageProps<"/coming-soon">): Promise<Metadata> {
  return libraryPageMetadata("/coming-soon", searchParams);
}

/**
 * The private Coming soon page, shared by two tabs that name a page alike
 * (prompts/library-page-urls.md): on movies the planned movies not released
 * yet, soonest first with Date TBA last (spec 0020, AC-13), and on games the
 * Want to play games not out yet, soonest release first, TBA last
 * (prompts/game-coming-soon.md). A bare URL is movies; shows have no page
 * here, so they show the "doesn't exist" panel.
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
export default function ComingSoonPage({
  searchParams,
}: PageProps<"/coming-soon">) {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading path="/coming-soon" />

      <LibraryErrorBoundary>
        <Suspense fallback={<LibrarySkeleton />}>
          <LibrarySection path="/coming-soon" searchParams={searchParams} />
        </Suspense>
      </LibraryErrorBoundary>
    </div>
  );
}
