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
 * Where each library page lives on each tab (prompts/library-page-urls.md):
 * a page's URL says its name, so Want to play is `/want-to-play`. Two tabs
 * that name a page alike share its route, and `?type` picks the tab:
 * `/watched` (shows, movies) and `/coming-soon` (movies' `upcoming`, games'
 * `coming-soon`). The one place a library path is written.
 */
const LIBRARY_PAGE_PATHS = {
  watchlist: { tv: "/up-next", movie: "/watchlist", game: "/want-to-play" },
  upcoming: { tv: "/upcoming", movie: "/coming-soon", game: "/playing" },
  watched: { tv: "/watched", movie: "/watched", game: "/finished" },
  "coming-soon": { game: "/coming-soon" },
} as const satisfies Record<LibraryList, Record<LibraryType, `/${string}`>> &
  Record<"coming-soon", { game: `/${string}` }>;

type PagePaths = typeof LIBRARY_PAGE_PATHS;

/** A library route: one of the eight paths `LIBRARY_PAGE_PATHS` holds. */
export type LibraryPath = {
  [K in LibraryPageKey]: PagePaths[K][keyof PagePaths[K]];
}[LibraryPageKey];

/** Every library route, once each, for the registries that list them. */
export const LIBRARY_PATHS: readonly LibraryPath[] = [
  ...new Set(
    Object.values(LIBRARY_PAGE_PATHS).flatMap(
      (paths) => Object.values(paths) as LibraryPath[],
    ),
  ),
];

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
 * A page on a tab that has it, typed so a caller narrowing on `type` also
 * knows `page`: a shows or movies tab never holds Coming soon, so its page
 * is a `LibraryList` and needs no second check.
 */
export type LibraryTab =
  | { type: "game"; page: LibraryPageKey }
  | { type: "tv" | "movie"; page: LibraryList };

/**
 * A page's route on one tab. A tab without the page (only games have Coming
 * soon) gets its Watchlist slot instead, so a tab switch from games' Coming
 * soon lands on Up next or Watchlist, never on a page that doesn't exist
 * (prompts/game-coming-soon.md, prompts/library-page-urls.md).
 */
export function libraryPath(
  page: LibraryPageKey,
  type: LibraryType,
): LibraryPath {
  const paths: Partial<Record<LibraryType, LibraryPath>> =
    LIBRARY_PAGE_PATHS[page];
  return paths[type] ?? LIBRARY_PAGE_PATHS.watchlist[type];
}

/**
 * The page a route is on a tab, or null when the tab has no page there
 * (`/playing?type=tv`). The inverse of `libraryPath`, which is how a route
 * file that knows only its path finds the page it renders: `/coming-soon` is
 * `upcoming` on movies and `coming-soon` on games.
 */
export function libraryPageAt(
  path: LibraryPath,
  type: LibraryType,
): LibraryPageKey | null {
  return (
    libraryPages(type).find((page) => libraryPath(page, type) === path) ?? null
  );
}

/**
 * The page and tab a route shows, or null when the tab lacks a page there,
 * which the route answers with the "doesn't exist" panel
 * (prompts/library-page-urls.md).
 */
export function libraryTab(
  path: LibraryPath,
  type: LibraryType,
): LibraryTab | null {
  const page = libraryPageAt(path, type);
  if (page === null) return null;
  if (type === "game") return { type, page };
  return page === "coming-soon" ? null : { type, page };
}

/** The tabs in navbar order, which `defaultLibraryType` searches. */
const LIBRARY_TYPES = [
  "tv",
  "movie",
  "game",
] as const satisfies readonly LibraryType[];

/**
 * The tab a page falls back to when its `type` is invalid or names a tab
 * without it: the first tab that has the page, so shows, the bare URL's tab,
 * except on Coming soon, which only games have.
 */
export function defaultLibraryType(page: LibraryPageKey): LibraryType {
  return LIBRARY_TYPES.find((type) => hasLibraryPage(page, type)) ?? "tv";
}

/**
 * The tab a route falls back to when its `type` is absent, invalid or names a
 * tab without it: the first tab, in navbar order, with a page there. So a
 * bare `/watchlist` opens movies and a bare `/playing` games
 * (prompts/library-page-urls.md).
 */
export function defaultLibraryTypeAt(path: LibraryPath): LibraryType {
  return (
    LIBRARY_TYPES.find((type) => libraryPageAt(path, type) !== null) ?? "tv"
  );
}

/**
 * The page and tab a route reads as on a tab: its own page there, or, on a
 * tab without a page at the route (`/playing?type=tv`), the route's default
 * tab and its page. One fallback for the heading, the title, the "doesn't
 * exist" panel's link and a tab switch from that panel, so they all name
 * the same page (prompts/library-page-urls.md).
 */
export function shownLibraryPage(
  path: LibraryPath,
  type: LibraryType,
): { page: LibraryPageKey; type: LibraryType } {
  const page = libraryPageAt(path, type);
  if (page !== null) return { page, type };
  const fallback = defaultLibraryTypeAt(path);
  // Every route has a page on its default tab; the `??` only satisfies the
  // compiler, which cannot see that from the table.
  return { page: libraryPageAt(path, fallback) ?? "watchlist", type: fallback };
}

/**
 * The name a route reads on a tab: its page's name there, or, on a tab
 * without a page at the route, the name on the route's default tab, as its
 * "doesn't exist" panel and its heading say.
 */
export function libraryPathName(path: LibraryPath, type: LibraryType): string {
  const shown = shownLibraryPage(path, type);
  return libraryPageName(shown.page, shown.type);
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
  const names: Partial<Record<LibraryType, string>> = LIBRARY_PAGE_NAMES[page];
  return names[type] ?? libraryPageName(page, defaultLibraryType(page));
}

/** An old library URL and the route that page lives at now. */
export type LegacyLibraryRedirect = {
  source: `/${LibraryPageKey}`;
  type: LibraryType;
  destination: LibraryPath;
};

/**
 * Every old library URL whose page moved (prompts/library-page-urls.md).
 * Until then each page key was its own shared route, `/${page}`, on every
 * tab, so Want to play was `/watchlist?type=game`. Derived from the table
 * rather than listed, so the paths stay written once: a pair is here exactly
 * when its old route is no longer its route. A tab's old URL without the page
 * (`/coming-soon?type=tv`) never existed, so it has none.
 */
export function legacyLibraryRedirects(): LegacyLibraryRedirect[] {
  return LIBRARY_TYPES.flatMap((type) =>
    libraryPages(type).flatMap((page) => {
      const source = `/${page}` as const;
      const destination = libraryPath(page, type);
      return source === destination ? [] : [{ source, type, destination }];
    }),
  );
}
