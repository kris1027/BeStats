import { requireUser } from "@/lib/auth/user";
import { type LibraryPath, libraryTab } from "@/lib/catalog/library-list";
import { parseLibraryPageType } from "@/lib/catalog/media-type";
import { parsePageParam } from "@/lib/catalog/pages";
import { requestTodayUtc } from "@/lib/tracking/episode-state";

import { gameLibraryTab } from "./game-library-tab";
import { LibrarySkeleton, NoSuchPage } from "./library-panels";
import { movieLibraryTab, watchedMoviesTab } from "./movie-library-tab";
import { showLibraryTab } from "./show-library-tab";

/**
 * Everything on a library page below its heading (spec 0020, AC-8 to AC-18;
 * spec 0008 for the shared states). It streams behind the page's Suspense
 * boundary, because it reads the session, the search params and the user's
 * rows. It lists one media type, the navbar tab's `type` parameter
 * (feature 22), or games (spec 0027, AC-5). The route and the tab together
 * name the page (`libraryTab`), and a tab with no page at the route, such as
 * `/playing?type=tv`, is the "doesn't exist" panel
 * (prompts/game-coming-soon.md, prompts/library-page-urls.md).
 *
 * The order is deliberate. `requireUser()` first, so a request that got past
 * the proxy still receives no list data. Then the type and page parameters,
 * so a malformed value never costs a query. Then today, read once for the
 * request (AC-22), and the tab's own read: a classified tab for shows and for
 * planned movies, the plain watched query for watched movies (AC-16), and
 * one stored status page for games (spec 0027, AC-6). A
 * redirect when the page is past the end, outside any `try`.
 *
 * Nothing here writes (AC-21). A failure of any read replaces the grid with
 * an error panel and a retry link, never the empty state, which would tell
 * the user their list is gone.
 */
async function LibrarySection({
  path,
  searchParams,
}: {
  path: LibraryPath;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const raw = await searchParams;
  const type = parseLibraryPageType(path, raw.type);
  const page = parsePageParam(raw.page);
  const tab = type === null ? null : libraryTab(path, type);
  if (tab === null) return <NoSuchPage path={path} type={null} />;
  if (page === null) return <NoSuchPage path={path} type={tab.type} />;

  const today = requestTodayUtc();
  if (tab.type === "game") {
    return gameLibraryTab({ tab: tab.page, userId: user.id, page, today });
  }
  if (tab.type === "tv") {
    return showLibraryTab({ tab: tab.page, userId: user.id, page, today });
  }
  if (tab.page === "watched") {
    return watchedMoviesTab({ userId: user.id, page });
  }
  return movieLibraryTab({ tab: tab.page, userId: user.id, page, today });
}

export { LibrarySection, LibrarySkeleton };
