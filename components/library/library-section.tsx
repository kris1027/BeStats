import { requireUser } from "@/lib/auth/user";
import { parseMediaTypeParam } from "@/lib/catalog/media-type";
import { parsePageParam } from "@/lib/catalog/pages";
import { requestTodayUtc } from "@/lib/tracking/episode-state";

import { LibrarySkeleton, NoSuchPage } from "./library-panels";
import { movieLibraryTab, watchedMoviesTab } from "./movie-library-tab";
import { showLibraryTab } from "./show-library-tab";
import type { LibraryList } from "./types";

/**
 * Everything on a library page below its heading (spec 0020, AC-8 to AC-18;
 * spec 0008 for the shared states). It streams behind the page's Suspense
 * boundary, because it reads the session, the search params and the user's
 * rows. It lists one media type, the navbar tab's `type` parameter
 * (feature 22).
 *
 * The order is deliberate. `requireUser()` first, so a request that got past
 * the proxy still receives no list data. Then the type and page parameters,
 * so a malformed value never costs a query. Then today, read once for the
 * request (AC-22), and the tab's own read: a classified tab for shows and for
 * planned movies, the plain watched query for watched movies (AC-16). A
 * redirect when the page is past the end, outside any `try`.
 *
 * Nothing here writes (AC-21). A failure of any read replaces the grid with
 * an error panel and a retry link, never the empty state, which would tell
 * the user their list is gone.
 */
async function LibrarySection({
  list,
  searchParams,
}: {
  list: LibraryList;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const raw = await searchParams;
  const type = parseMediaTypeParam(raw.type);
  const page = parsePageParam(raw.page);
  if (type === null) return <NoSuchPage list={list} type={null} />;
  if (page === null) return <NoSuchPage list={list} type={type} />;

  const today = requestTodayUtc();
  if (type === "tv") {
    return showLibraryTab({ tab: list, userId: user.id, page, today });
  }
  if (list === "watched") {
    return watchedMoviesTab({ userId: user.id, page });
  }
  return movieLibraryTab({ tab: list, userId: user.id, page, today });
}

export { LibrarySection, LibrarySkeleton };
