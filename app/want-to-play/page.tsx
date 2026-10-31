import type { Metadata } from "next";

import { LibraryRoute } from "@/components/library/library-route";
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
 */
export default function WantToPlayPage({
  searchParams,
}: PageProps<"/want-to-play">) {
  return <LibraryRoute path="/want-to-play" searchParams={searchParams} />;
}
