import type { Genre } from "@/lib/tmdb/types";

/**
 * Carries a genre selection from one catalog to the other when the type
 * switches (spec 0010, AC-24).
 *
 * Movie and TV genres are separate lists whose ids differ, so a genre survives
 * only when the other list has one with exactly the same name, and it travels
 * as that list's id. The rest are dropped by name, for the `Removed:` note. The
 * result therefore never holds an id that is invalid for the target type.
 *
 * @param ids The selected ids in the `from` list.
 * @param from The genre list the ids belong to.
 * @param to The genre list of the type being switched to.
 * @returns The mapped ids, sorted ascending, and the names that were dropped.
 */
export function mapGenresAcrossTypes(
  ids: readonly number[],
  from: readonly Genre[],
  to: readonly Genre[],
): { kept: number[]; dropped: string[] } {
  const kept = new Set<number>();
  const dropped: string[] = [];
  for (const id of ids) {
    const genre = from.find((candidate) => candidate.id === id);
    if (!genre) continue;
    const match = to.find((candidate) => candidate.name === genre.name);
    if (match) kept.add(match.id);
    else dropped.push(genre.name);
  }
  return { kept: [...kept].sort((a, b) => a - b), dropped };
}
