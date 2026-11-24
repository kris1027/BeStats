import { z } from "zod";

import { GRID_PAGE_SIZE } from "../../catalog/grid-page";
import type { LibraryType } from "../../catalog/media-type";
import { parsePageParam } from "../../catalog/pages";

/**
 * The browse contracts of `/api/v1` (spec 0035, API surface): `/genres`,
 * `/platforms`, `/search` and `/lists/{type}/{list}`. They answer the same reads the web's
 * `/search` page and list pages make, so a page in the app holds what the
 * same page on the web holds. Pages are the web's 24 title grid pages, so app
 * page N is web page N (prompts/mobile-api-v1.md, decided for 4d).
 */

/** The three catalogs, as `LibraryType` names them (lib/catalog/AGENTS.md). */
export const v1CatalogTypeSchema = z.enum([
  "movie",
  "tv",
  "game",
]) satisfies z.ZodType<LibraryType>;

/**
 * An optional `page` query value, read by the web's own `parsePageParam`, so
 * the app and the web refuse the same pages (blank, zero, above 500).
 */
export const v1PageQuerySchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const page = parsePageParam(value);
    if (page === null) {
      ctx.addIssue({ code: "custom", message: "invalid page" });
      return z.NEVER;
    }
    return page;
  });

/** The grid page size every browse page and library page is cut to. */
export const V1_PAGE_SIZE = GRID_PAGE_SIZE;

/** `GET /api/v1/genres?type=`. */
export const v1GenresQuerySchema = z.object({ type: v1CatalogTypeSchema });

/**
 * The genres the search filter takes ids from: TMDB's movie or TV list, or
 * IGDB's game genres, the same cached reads the web's filter bar uses.
 */
export const v1GenresSchema = z.object({
  type: v1CatalogTypeSchema,
  genres: z.array(z.object({ id: z.number(), name: z.string() })),
});

export type V1Genres = z.infer<typeof v1GenresSchema>;

/**
 * `GET /api/v1/platforms`: IGDB's platforms, the ids a games search's
 * `platform` param takes (spec 0029, AC-10), from the same cached list the
 * web's filter bar and the search parser read, so an id the app sends is one
 * the parser accepts (AGENTS.md section 5; prompts/mobile-look-search.md,
 * decision 4). Its own
 * route so the genres contract stays as the app already reads it.
 */
export const v1PlatformsSchema = z.object({
  platforms: z.array(z.object({ id: z.number(), name: z.string() })),
});

export type V1Platforms = z.infer<typeof v1PlatformsSchema>;

/**
 * One title in a browse page, from any catalog: what the web's poster card
 * shows. `communityRating` is TMDB's or IGDB's, never the user's (AGENTS.md
 * section 9). `posterUrl` is the poster or game cover as a full CDN URL at
 * its ceiling size, or null when there is none (spec 0035, Images).
 * `releaseDate` is a movie's or game's release day and a show's first air
 * day.
 */
export const v1CatalogItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.number().int().nullable(),
  releaseDate: z.string().nullable(),
  posterUrl: z.string().nullable(),
  communityRating: z.number().nullable(),
});

export type V1CatalogItem = z.infer<typeof v1CatalogItemSchema>;

/**
 * The paging every browse page shares. `total` is the catalog's own count,
 * or null when it sent none (an IGDB discover list); `totalIsExact` is false
 * when the count is not the number of results that meet the request (a
 * filtered search, AGENTS.md section 10). `nextPage` is null on the last
 * page.
 */
const pagingShape = {
  type: v1CatalogTypeSchema,
  page: z.number().int().min(1),
  pageSize: z.literal(V1_PAGE_SIZE),
  results: z.array(v1CatalogItemSchema),
  total: z.number().int().min(0).nullable(),
  totalIsExact: z.boolean(),
  nextPage: z.number().int().min(2).nullable(),
};

/**
 * `GET /api/v1/search`: the query takes the web's own `/search` params
 * (`type`, `q`, `genre` and `platform` repeatable, `year`, `rating`,
 * `page`), parsed by the same core parser.
 *
 * `mode` says which read answered (core `searchMode`). In
 * `filtered_search`, `page` and `nextPage` are TMDB page cursors, `results`
 * holds every result that meets every filter from the pages read (it may
 * hold more or fewer than 24), `scanned` names the TMDB result range that
 * was checked, and `total` is TMDB's unfiltered count, so `totalIsExact` is
 * false (AGENTS.md section 10). In every other mode `scanned` is null.
 */
export const v1SearchSchema = z.object({
  ...pagingShape,
  mode: z.enum(["browse", "discover", "search", "filtered_search"]),
  scanned: z
    .object({
      fromIndex: z.number().int().min(1),
      toIndex: z.number().int().min(0),
    })
    .nullable(),
});

export type V1Search = z.infer<typeof v1SearchSchema>;

/** `GET /api/v1/lists/{type}/{list}`: a list slug from `lists.ts`. */
export const v1ListParamsSchema = z.object({
  type: v1CatalogTypeSchema,
  list: z.string().regex(/^[a-z-]{1,40}$/),
});

/** One page of a catalog list, the same page the web's list page shows. */
export const v1ListSchema = z.object({
  ...pagingShape,
  list: z.string(),
});

export type V1List = z.infer<typeof v1ListSchema>;

/**
 * The next page after `page`, or null on the last one. `lastPage` null means
 * the catalog sent no count, and then `hasMore` decides (IGDB's paging).
 */
export function nextPageOf(
  page: number,
  lastPage: number | null,
  hasMore = false,
): number | null {
  if (lastPage === null) return hasMore ? page + 1 : null;
  return page < lastPage ? page + 1 : null;
}
