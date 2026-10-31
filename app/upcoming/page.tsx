import type { Metadata } from "next";

import { LibraryRoute } from "@/components/library/library-route";
import { libraryPageMetadata } from "@/lib/catalog/library-metadata";

export function generateMetadata({
  searchParams,
}: PageProps<"/upcoming">): Promise<Metadata> {
  return libraryPageMetadata("/upcoming", searchParams);
}

/**
 * The private Upcoming page, the shows tab's: the tracked shows not out yet
 * and the ones caught up with a dated next episode (spec 0020, AC-11, AC-15;
 * prompts/library-page-urls.md). It has no Up Next section and no Mark
 * watched button. Any other tab shows the "doesn't exist" panel.
 */
export default function UpcomingPage({ searchParams }: PageProps<"/upcoming">) {
  return <LibraryRoute path="/upcoming" searchParams={searchParams} />;
}
