import type { ReactNode } from "react";

import { TmdbRatingBadge } from "@/components/rating-badges";
import type { LibraryList } from "@/lib/catalog/library-list";

/**
 * The top right badge of a catalog poster card, shared by movies and shows
 * (prompts/catalog-card-status.md, R1 to R5): the user's own rating when the
 * title is on Watched with one, nothing on Upcoming, where the date pill
 * speaks instead, and the TMDB rating otherwise. One rule for both media
 * types, so the two grids cannot drift apart.
 *
 * @param page The library page the title sits on, or undefined when none.
 * @param personal The personal badge, or null when there is no rating.
 * @param tmdbRating The card's TMDB rating.
 */
function CardRatingBadge({
  page,
  personal,
  tmdbRating,
}: {
  page: LibraryList | undefined;
  personal: ReactNode;
  tmdbRating: number | null;
}) {
  if (page === "watched" && personal !== null) return personal;
  if (page === "upcoming") return null;
  return <TmdbRatingBadge value={tmdbRating} />;
}

export { CardRatingBadge };
