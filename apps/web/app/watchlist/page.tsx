import type { Metadata } from "next";

import { LibraryRoute } from "@/components/library/library-route";
import { libraryPageMetadata } from "@/lib/catalog/library-metadata";

export function generateMetadata({
  searchParams,
}: PageProps<"/watchlist">): Promise<Metadata> {
  return libraryPageMetadata("/watchlist", searchParams);
}

/**
 * The private Watchlist, the movies tab's first page: the planned movies
 * already out (spec 0020, AC-13; prompts/library-page-urls.md). Shows have
 * Up next and games Want to play instead, so any other tab shows the
 * "doesn't exist" panel, and a bare URL is movies.
 */
export default function WatchlistPage({
  searchParams,
}: PageProps<"/watchlist">) {
  return <LibraryRoute path="/watchlist" searchParams={searchParams} />;
}
