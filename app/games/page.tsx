import type { Metadata } from "next";

import { CatalogLanding } from "@/components/catalog/catalog-landing";
import { gamesMetadata } from "@/lib/landing-metadata";

/**
 * The games landing's metadata (spec 0032, AC-4): its title and description,
 * the canonical `/games` and the site card, like `/movies` and `/shows`.
 */
export const metadata: Metadata = gamesMetadata({
  title: "Games",
  description:
    "Browse trending, popular, new, upcoming and top rated games on BeStats, and keep track of what you play.",
});

/**
 * The games landing (spec 0028, AC-1): the same parallax landing as `/shows`
 * and `/movies`, filled from IGDB. No session is read here; only the hero's
 * status control reads it, in its own Suspense boundary (AC-19).
 */
export default function GamesPage() {
  return <CatalogLanding heading="Games" mediaType="game" />;
}
