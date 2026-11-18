/** Anything with a season number, so this stays free of the TMDB module. */
type Numbered = { seasonNumber: number };

/**
 * A show's seasons in the order the pages list them: regular seasons in
 * ascending number, then season 0 (Specials) last (spec 0009, AC-7).
 *
 * Specials go last because they sit outside a show's main run (AGENTS.md
 * section 7), and a visitor browsing in order should reach Season 1 first. The
 * input is copied, never sorted in place, because it is a cached value.
 *
 * Pure and free of `server-only`, so tests and any component can use it.
 */
export function orderSeasons<T extends Numbered>(seasons: readonly T[]): T[] {
  return [...seasons].sort((a, b) => {
    if (a.seasonNumber === 0) return b.seasonNumber === 0 ? 0 : 1;
    if (b.seasonNumber === 0) return -1;
    return a.seasonNumber - b.seasonNumber;
  });
}

/**
 * The seasons either side of `seasonNumber` in an `orderSeasons` list, for
 * the season page's Previous and Next links (spec 0009, AC-12). An end of the
 * list, or a number not in it, gives null on that side.
 */
export function adjacentSeasons<T extends Numbered>(
  ordered: readonly T[],
  seasonNumber: number,
): { previous: T | null; next: T | null } {
  const index = ordered.findIndex(
    (season) => season.seasonNumber === seasonNumber,
  );
  if (index === -1) return { previous: null, next: null };
  return {
    previous: ordered[index - 1] ?? null,
    next: ordered[index + 1] ?? null,
  };
}
