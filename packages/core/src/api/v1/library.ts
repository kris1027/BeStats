import { z } from "zod";

import { LIBRARY_PATHS, type LibraryPath } from "../../catalog/library-list";
import { V1_PAGE_SIZE, v1CatalogTypeSchema, v1PageQuerySchema } from "./browse";
import {
  v1GameTitleStateSchema,
  v1MovieTitleStateSchema,
  v1ShowTitleStateSchema,
} from "./titles";

/**
 * `GET /api/v1/me/library` (spec 0035, `LibraryEntry`): one page of one
 * library page, in the web page's order, placed per request by the same
 * loaders the web uses (AGENTS.md section 9). Shapes settled for 4d in
 * prompts/mobile-api-v1.md: the web's 24 per page, the title's own route as
 * `path`, the web's notes beside `nextPage`, and a missing card apart from a
 * failed read.
 */

/**
 * The query: a type and a library route. The route answers 404 for a pair
 * with no page (`/playing` with `type=tv`); it never takes a page key from
 * the client (lib/catalog/AGENTS.md).
 */
export const v1LibraryQuerySchema = z.object({
  type: v1CatalogTypeSchema,
  path: z.enum(LIBRARY_PATHS as [LibraryPath, ...LibraryPath[]]),
  page: v1PageQuerySchema,
});

/** A title the catalog no longer has: the web's "No longer on TMDB" card. */
const missingCardSchema = z.object({ kind: z.literal("missing") });

const episodePlaceSchema = z.object({
  season: z.number().int().min(1),
  episode: z.number().int().min(1),
});

/**
 * Where a show sits and what its card says there, as core's `classifyShow`
 * places it: Up next offers the next aired episode, Upcoming its air date
 * (null for Date TBA), Watched its Finished or Caught up label.
 */
const showPlaceSchema = z.discriminatedUnion("page", [
  z.object({ page: z.literal("watchlist"), next: episodePlaceSchema }),
  z.object({
    page: z.literal("upcoming"),
    airDate: z.string().nullable(),
    next: episodePlaceSchema.nullable(),
  }),
  z.object({
    page: z.literal("watched"),
    label: z.enum(["finished", "caught_up"]),
  }),
]);

/** What a show card shows; `tmdbRating` is TMDB's, never the user's. */
const showCardSchema = z.object({
  kind: z.literal("title"),
  name: z.string(),
  posterUrl: z.string().nullable(),
  tmdbRating: z.number().nullable(),
  place: showPlaceSchema,
});

/**
 * What a movie card shows. `releaseDate` is TMDB's release day; on Coming
 * soon, null means Date TBA.
 */
const movieCardSchema = z.object({
  kind: z.literal("title"),
  name: z.string(),
  posterUrl: z.string().nullable(),
  tmdbRating: z.number().nullable(),
  releaseDate: z.string().nullable(),
});

/**
 * What a game card shows; `communityRating` is IGDB's. `startedAt` and
 * `finishedAt` are the user's stored timestamps, for the Started and Finished
 * month line core's `gameDateLine` prints (spec 0027, AC-9;
 * prompts/mobile-library-review-fixes.md, item 8).
 */
const gameCardSchema = z.object({
  kind: z.literal("title"),
  name: z.string(),
  coverUrl: z.string().nullable(),
  communityRating: z.number().nullable(),
  releaseDate: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

const entryBase = {
  id: z.number().int().positive(),
  /** The title's own route, `/movies/603`, `/shows/1399` or `/games/1942`. */
  path: z.string(),
};

/**
 * One title on the page. `user` is the same state `/me/titles` returns for
 * it. `card` is null only when the catalog read failed for it, so the
 * user's history still shows (AGENTS.md section 12); a title the catalog no
 * longer has is `{ kind: "missing" }`.
 */
export const v1LibraryEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("movie"),
    ...entryBase,
    user: v1MovieTitleStateSchema,
    card: z.union([movieCardSchema, missingCardSchema]).nullable(),
  }),
  z.object({
    type: z.literal("tv"),
    ...entryBase,
    user: v1ShowTitleStateSchema,
    card: z.union([showCardSchema, missingCardSchema]).nullable(),
  }),
  z.object({
    type: z.literal("game"),
    ...entryBase,
    user: v1GameTitleStateSchema,
    card: z.union([gameCardSchema, missingCardSchema]).nullable(),
  }),
]);

export type V1LibraryEntry = z.infer<typeof v1LibraryEntrySchema>;

/**
 * The page. `total` counts every entry on the library page across pages; a
 * page past the end comes back empty with the real total. `failedCount` is
 * the titles whose own catalog read failed, which are on no page; `capped`
 * says the 500 title ceiling left older titles unchecked. Both feed the
 * notes the web shows.
 */
export const v1LibrarySchema = z.object({
  type: v1CatalogTypeSchema,
  path: z.string(),
  page: z.number().int().min(1),
  pageSize: z.literal(V1_PAGE_SIZE),
  entries: z.array(v1LibraryEntrySchema),
  total: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  capped: z.boolean(),
  nextPage: z.number().int().min(2).nullable(),
});

export type V1Library = z.infer<typeof v1LibrarySchema>;
