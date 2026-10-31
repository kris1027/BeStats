import type { Metadata } from "next";

import { LibraryRoute } from "@/components/library/library-route";
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
 */
export default function WatchedPage({ searchParams }: PageProps<"/watched">) {
  return <LibraryRoute path="/watched" searchParams={searchParams} />;
}
