/**
 * The rows a picker's filter box leaves: a case insensitive match anywhere in
 * the name, every row when the box is blank. The web's platforms popover and
 * the phone's platforms view filter the same ~220 IGDB platforms, so they
 * share this one rule (spec 0029, AC-10; packages/core/AGENTS.md, a rule
 * lives in one package).
 */
export function filterByName<T extends { name: string }>(
  rows: readonly T[],
  filter: string,
): readonly T[] {
  const needle = filter.trim().toLowerCase();
  return needle
    ? rows.filter((row) => row.name.toLowerCase().includes(needle))
    : rows;
}

/**
 * True once a picker holds its most ids, so both apps disable the unticked
 * rows and show the cap hint at the same moment (spec 0029, AC-10). A catalog
 * with no cap (`maxFilterIds` null or absent) is never full.
 */
export function isPickerFull(
  selected: readonly number[],
  max: number | null | undefined,
): boolean {
  return max != null && selected.length >= max;
}
