import type { Metadata } from "next";

import { CatalogLanding } from "@/components/catalog/catalog-landing";
import { catalogListsFor } from "@/lib/catalog/lists";
import { landingMetadata } from "@/lib/seo/metadata";

/**
 * The landing's metadata (spec 0021, AC-15): one page now, so one canonical,
 * the bare path. A `?page=N` request never reaches it; `next.config.ts`
 * redirects it to `/shows/popular` (AC-14).
 */
export const metadata: Metadata = landingMetadata({
  title: "Shows",
  description:
    "Browse trending, popular, airing and top rated TV shows on BeStats, and keep track of what you watch.",
  path: "/shows",
});

/**
 * The TV landing: one carousel row per TV list, in registry order (spec
 * 0021, AC-1). No session is read here; each card's slots read it inside
 * their own Suspense boundaries (`components/catalog/list-cards.tsx`).
 */
export default function ShowsPage() {
  return <CatalogLanding heading="Shows" lists={catalogListsFor("tv")} />;
}
