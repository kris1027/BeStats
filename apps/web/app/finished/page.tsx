import type { Metadata } from "next";

import { LibraryRoute } from "@/components/library/library-route";
import { libraryPageMetadata } from "@/lib/catalog/library-metadata";

export function generateMetadata({
  searchParams,
}: PageProps<"/finished">): Promise<Metadata> {
  return libraryPageMetadata("/finished", searchParams);
}

/**
 * The private Finished page, the games tab's: the games marked Finished,
 * most recently finished first (spec 0027; prompts/library-page-urls.md).
 * Any other tab shows the "doesn't exist" panel.
 */
export default function FinishedPage({ searchParams }: PageProps<"/finished">) {
  return <LibraryRoute path="/finished" searchParams={searchParams} />;
}
