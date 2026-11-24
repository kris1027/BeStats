import {
  CATALOG_SOURCES,
  type LibraryType,
} from "@bestats/core/catalog/media-type";

/**
 * A community rating's value as every card prints it, one decimal: the
 * display rounding of AGENTS.md section 9. The catalog cards, the library
 * cards and the badge all read it, so the rule lives in one place.
 */
export function formatCommunityRating(value: number): string {
  return value.toFixed(1);
}

/**
 * A community rating as one line that names its source, `TMDB 7.4` or
 * `IGDB 8.1`, so it can never be read as a personal score (AGENTS.md
 * section 9). Null when the catalog has no rating: absent is not zero.
 */
export function communityRatingText(
  type: LibraryType,
  value: number | null,
): string | null {
  return value === null
    ? null
    : `${CATALOG_SOURCES[type]} ${formatCommunityRating(value)}`;
}

/**
 * What a screen reader says for a community rating, "TMDB rating 7.4" or
 * "IGDB community rating 81.0", so it is never heard as the user's own score
 * (AGENTS.md section 9). Every title screen, episode row and card reads it.
 */
export function communityRatingLabel(
  type: LibraryType,
  value: number | null,
): string | null {
  if (value === null) return null;
  const noun = type === "game" ? "community rating" : "rating";
  return `${CATALOG_SOURCES[type]} ${noun} ${formatCommunityRating(value)}`;
}
