import { type V1Library, v1LibrarySchema } from "@bestats/core/api/v1/library";
import type { LibraryPath } from "@bestats/core/catalog/library-list";
import type { LibraryType } from "@bestats/core/catalog/media-type";
import { useInfiniteQuery } from "@tanstack/react-query";

import { apiRequest } from "./api";
import { PRIVATE_QUERY_ROOT } from "./query-client";

/**
 * Query keys of the library pages. They start with `PRIVATE_QUERY_ROOT`, so
 * sign out and an expired session wipe them with the rest of the user's
 * state (spec 0033, AC-13), and every tracking write invalidates `all`, so a
 * title's new page shows when the library is opened again (AGENTS.md
 * section 9, placement is worked out per request).
 */
export const libraryKeys = {
  all: [PRIVATE_QUERY_ROOT, "library"] as const,
  page: (type: LibraryType, path: LibraryPath) =>
    [PRIVATE_QUERY_ROOT, "library", type, path] as const,
};

/**
 * `GET /api/v1/me/library`: one page of 24 of one library page. The app
 * sends the web route (`/up-next`) and the type, never a page key; the
 * server resolves the page with core's `libraryPageAt` (spec 0033, AC-10).
 */
export function fetchLibraryPage(
  type: LibraryType,
  path: LibraryPath,
  page: number,
): Promise<V1Library> {
  const query = new URLSearchParams({ type, path, page: String(page) });
  return apiRequest(`/api/v1/me/library?${query}`, v1LibrarySchema, {
    auth: true,
  });
}

/**
 * A library page with infinite scroll, as the catalog lists page
 * (prompts/mobile-library-tabs.md, decision 3). Runs only with a session, so
 * a signed out Library tab sends no private request (AGENTS.md section 11).
 */
export function useLibraryPage(
  type: LibraryType,
  path: LibraryPath,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: libraryKeys.page(type, path),
    queryFn: ({ pageParam }) => fetchLibraryPage(type, path, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: V1Library) => last.nextPage ?? undefined,
    enabled,
  });
}
