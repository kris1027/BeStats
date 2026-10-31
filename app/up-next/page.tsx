import type { Metadata } from "next";

import { LibraryRoute } from "@/components/library/library-route";
import { libraryPageMetadata } from "@/lib/catalog/library-metadata";

export function generateMetadata({
  searchParams,
}: PageProps<"/up-next">): Promise<Metadata> {
  return libraryPageMetadata("/up-next", searchParams);
}

/**
 * The private Up next page, the shows tab's first: the tracked shows with an
 * aired episode left to watch, each with its next episode and Mark watched
 * (spec 0020, AC-9; prompts/library-page-urls.md). Any other tab has no
 * page here, so it shows the "doesn't exist" panel.
 */
export default function UpNextPage({ searchParams }: PageProps<"/up-next">) {
  return <LibraryRoute path="/up-next" searchParams={searchParams} />;
}
