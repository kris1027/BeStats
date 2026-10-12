import type { Metadata } from "next";

import { CatalogLanding } from "@/components/catalog/catalog-landing";
import { catalogListsFor } from "@/lib/catalog/lists";
import { landingMetadata } from "@/lib/seo/metadata";

/**
 * The landing's metadata (spec 0021, AC-15): one page now, so one canonical,
 * the bare path. A `?page=N` request never reaches it; `next.config.ts`
 * redirects it to `/movies/popular` (AC-14).
 */
export const metadata: Metadata = landingMetadata({
  title: "Movies",
  description:
    "Browse trending, popular, now playing, upcoming and top rated movies on BeStats, and keep track of what you watch.",
  path: "/movies",
});

/**
 * The movie landing: one carousel row per movie list, in registry order
 * (spec 0021, AC-1). No session is read here (spec 0006, AC-13); each card's
 * badge and controls read it inside their own Suspense boundaries
 * (`components/catalog/list-cards.tsx`).
 */
export default function MoviesPage() {
  return <CatalogLanding heading="Movies" lists={catalogListsFor("movie")} />;
}
