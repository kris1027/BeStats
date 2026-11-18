import { Suspense } from "react";

import type { LibraryPath } from "@/lib/catalog/library-list";

import { LibraryErrorBoundary } from "./library-error-boundary";
import { LibraryHeading } from "./library-heading";
import { LibrarySection, LibrarySkeleton } from "./library-section";

/**
 * The body every library route renders (prompts/library-page-urls.md): the
 * eight route files differ only in their path and what they hold, so the
 * shell is written once here.
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
 * 0008, AC-16). Nothing on a library page writes when it loads (spec 0020,
 * AC-21).
 */
export function LibraryRoute({
  path,
  searchParams,
}: {
  path: LibraryPath;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading path={path} />

      <LibraryErrorBoundary>
        <Suspense fallback={<LibrarySkeleton />}>
          <LibrarySection path={path} searchParams={searchParams} />
        </Suspense>
      </LibraryErrorBoundary>
    </div>
  );
}
