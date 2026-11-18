import type { Metadata } from "next";

import { LibraryRoute } from "@/components/library/library-route";
import { libraryPageMetadata } from "@/lib/catalog/library-metadata";

export function generateMetadata({
  searchParams,
}: PageProps<"/playing">): Promise<Metadata> {
  return libraryPageMetadata("/playing", searchParams);
}

/**
 * The private Playing page, the games tab's: the games marked Playing, by
 * when they were started (spec 0027; prompts/library-page-urls.md). Any
 * other tab shows the "doesn't exist" panel.
 */
export default function PlayingPage({ searchParams }: PageProps<"/playing">) {
  return <LibraryRoute path="/playing" searchParams={searchParams} />;
}
