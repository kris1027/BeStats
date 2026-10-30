import type { LibraryType } from "./media-type";

/**
 * The three private library pages a title can sit on (spec 0020, AC-8).
 * Defined once so the show classifier, the movie classifier and the page
 * components cannot drift apart. Pure, free of `server-only`, like the rest
 * of `lib/catalog/`.
 */
export type LibraryList = "watchlist" | "upcoming" | "watched";

/**
 * What each library page is called on each navbar tab
 * (prompts/library-page-names.md). The routes are shared, but a page is named
 * for what it holds on that tab: a games tab lists the stored statuses, so it
 * reads Want to play, Playing and Finished, never Watchlist.
 */
const LIBRARY_PAGE_NAMES = {
  watchlist: { tv: "Up next", movie: "Watchlist", game: "Want to play" },
  upcoming: { tv: "Upcoming", movie: "Coming soon", game: "Playing" },
  watched: { tv: "Watched", movie: "Watched", game: "Finished" },
} as const satisfies Record<LibraryList, Record<LibraryType, string>>;

/**
 * A library page's name on one tab: the navbar link, the page heading and
 * title, and every label that names the page. The one place these names are
 * written, so the nav and the page it opens always agree.
 */
export function libraryPageName(list: LibraryList, type: LibraryType): string {
  return LIBRARY_PAGE_NAMES[list][type];
}
