import {
  nextPageOf,
  V1_PAGE_SIZE,
  type V1List,
  v1ListParamsSchema,
  v1PageQuerySchema,
} from "@bestats/core/api/v1/browse";
import { CATALOG_LISTS } from "@bestats/core/catalog/lists";
import { IGDB_MAX_PAGE } from "@bestats/core/igdb/constants";
import { z } from "zod";

import {
  catalogFailure,
  itemFromGame,
  itemFromMovie,
  itemFromShow,
} from "@/lib/api/v1/browse";
import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import {
  lastListPage,
  readTaggedCatalogGridPage,
  type TaggedCatalogPage,
} from "@/lib/catalog-list-read";

/**
 * `GET /api/v1/lists/{type}/{list}?page=` (spec 0035): one 24 title page of
 * a catalog list (Popular, Trending, Top rated and the rest from core's
 * `lists.ts`), read through `readTaggedCatalogGridPage`, the very read the
 * web's list pages make, so app page N is web page N and the two share
 * cache entries.
 *
 * An unknown slug or a page past the list's end is 404, as the web's "That
 * page doesn't exist"; page 1 of an empty list is an empty page. A catalog
 * failure is 502. Errors are `no-store`; a success may be shared by a CDN
 * for five minutes (AGENTS.md section 11: nothing here depends on who asks).
 */
export const GET = withV1({
  name: "lists.get",
  auth: "public",
  cache: "public, s-maxage=300, stale-while-revalidate=600",
  input: {
    params: v1ListParamsSchema,
    query: z.object({ page: v1PageQuerySchema }),
  },
  handler: async ({ input }) => {
    const { type, list: slug } = input.params;
    const { page } = input.query;
    const list = CATALOG_LISTS.find(
      (entry) => entry.mediaType === type && entry.slug === slug,
    );
    if (list === undefined) return v1Fail("not_found");

    let tagged: TaggedCatalogPage;
    try {
      tagged = await readTaggedCatalogGridPage(list, page);
    } catch (error) {
      return catalogFailure(error);
    }

    const lastPage = lastListPage(tagged);
    const results =
      tagged.mediaType === "game"
        ? tagged.paged.results.map(itemFromGame)
        : tagged.mediaType === "movie"
          ? tagged.paged.results.map(itemFromMovie)
          : tagged.paged.results.map(itemFromShow);
    const pastEnd =
      page > 1 &&
      (results.length === 0 || (lastPage !== null && page > lastPage));
    if (pastEnd) return v1Fail("not_found");

    const total = tagged.paged.totalResults;
    const hasMore =
      tagged.mediaType === "game" &&
      tagged.paged.hasNextPage &&
      page < IGDB_MAX_PAGE;
    const body: V1List = {
      type,
      list: slug,
      page,
      pageSize: V1_PAGE_SIZE,
      results,
      total,
      totalIsExact: total !== null,
      nextPage: nextPageOf(page, lastPage, hasMore),
    };
    return v1Ok(body);
  },
});
