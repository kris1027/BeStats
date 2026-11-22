/**
 * Every title of the pages loaded so far, in order, each once
 * (spec 0022, AC-21; prompts/mobile-app-shell-catalog.md, decision 6).
 *
 * The web's grid pages may overlap: TMDB repeats titles across its own
 * pages, and a grid page that came back short is filled from the next page's
 * first titles, which that page shows again. The web shows one page at a
 * time, so the repeat sits on two pages; infinite scroll joins the pages into
 * one grid, which keys cards by id, so the app keeps the first copy and drops
 * the later ones.
 */
export function joinPageResults<T extends { id: number }>(
  pages: readonly { results: readonly T[] }[],
): T[] {
  const seen = new Set<number>();
  const joined: T[] = [];
  for (const page of pages) {
    for (const result of page.results) {
      if (seen.has(result.id)) continue;
      seen.add(result.id);
      joined.push(result);
    }
  }
  return joined;
}
