import type { LibraryType } from "./media-type";

/**
 * The three private library pages a title can sit on (spec 0020, AC-8).
 * Defined once so the show classifier, the movie classifier and the page
 * components cannot drift apart. Pure, free of `server-only`, like the rest
 * of `lib/catalog/`.
 */
export type LibraryList = "watchlist" | "upcoming" | "watched";

/**
 * Every library page, the three shared ones and `coming-soon`, which only
 * the games tab has: its Want to play games not out yet
 * (prompts/game-coming-soon.md). Kept apart from `LibraryList` so the show
 * and movie records keyed by it never need a page they don't have.
 */
export type LibraryPageKey = LibraryList | "coming-soon";

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
  "coming-soon": { game: "Coming soon" },
} as const satisfies Record<LibraryList, Record<LibraryType, string>> &
  Record<"coming-soon", { game: string }>;

/**
 * Each tab's pages, in navbar order. Games follow a game's life: Coming soon
 * before Want to play (prompts/game-coming-soon.md).
 */
const TAB_PAGES = {
  tv: ["watchlist", "upcoming", "watched"],
  movie: ["watchlist", "upcoming", "watched"],
  game: ["coming-soon", "watchlist", "upcoming", "watched"],
} as const satisfies Record<LibraryType, readonly LibraryPageKey[]>;

/** The pages a tab has, in the order the navbar lists them. */
export function libraryPages(type: LibraryType): readonly LibraryPageKey[] {
  return TAB_PAGES[type];
}

/** True when the tab has the page: every tab but games lacks Coming soon. */
export function hasLibraryPage(page: LibraryPageKey, type: LibraryType) {
  return (TAB_PAGES[type] as readonly LibraryPageKey[]).includes(page);
}

/**
 * The tab a page falls back to when its `type` is invalid or names a tab
 * without it: shows, the bare URL's tab, except on Coming soon, which only
 * games have.
 */
export function defaultLibraryType(page: LibraryPageKey): LibraryType {
  return page === "coming-soon" ? "game" : "tv";
}

/**
 * A library page's name on one tab: the navbar link, the page heading and
 * title, and every label that names the page. The one place these names are
 * written, so the nav and the page it opens always agree. A tab without the
 * page reads the page's default tab, as its "doesn't exist" panel does.
 */
export function libraryPageName(
  page: LibraryPageKey,
  type: LibraryType,
): string {
  if (page === "coming-soon") return LIBRARY_PAGE_NAMES[page].game;
  return LIBRARY_PAGE_NAMES[page][type];
}
