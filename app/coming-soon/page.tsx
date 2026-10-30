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
  return libraryPageMetadata("coming-soon", searchParams);
}

/**
 * The private Coming soon page, which only the navbar's games tab has: the
 * Want to play games not out yet, soonest release first, TBA last
 * (prompts/game-coming-soon.md). Any other `type` shows the "doesn't exist"
 * panel.
 *
 * The same shell as `/watchlist`: the heading and a skeleton grid are
 * static, and everything that reads the session, the parameters or the
 * user's rows streams in behind the Suspense boundary, inside
 * `LibrarySection`, which calls `requireUser()` itself. Nothing on this page
 * writes when it loads (spec 0020, AC-21).
 */
export default function ComingSoonPage({
  searchParams,
}: PageProps<"/coming-soon">) {
  return (
    <div className="flex flex-col gap-8">
      <LibraryHeading list="coming-soon" />

      <LibraryErrorBoundary>
        <Suspense fallback={<LibrarySkeleton />}>
          <LibrarySection list="coming-soon" searchParams={searchParams} />
        </Suspense>
      </LibraryErrorBoundary>
    </div>
  );
}
