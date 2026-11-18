import type { Metadata } from "next";

import { LibraryRoute } from "@/components/library/library-route";
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
 */
export default function ComingSoonPage({
  searchParams,
}: PageProps<"/coming-soon">) {
  return <LibraryRoute path="/coming-soon" searchParams={searchParams} />;
}
