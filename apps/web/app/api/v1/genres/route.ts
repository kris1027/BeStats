import {
  type V1Genres,
  v1GenresQuerySchema,
} from "@bestats/core/api/v1/browse";

import { catalogFailure } from "@/lib/api/v1/browse";
import { v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { getGameGenres } from "@/lib/igdb";
import { getMovieGenres, getTvGenres } from "@/lib/tmdb";

const READS = {
  movie: getMovieGenres,
  tv: getTvGenres,
  game: getGameGenres,
} as const;

/**
 * `GET /api/v1/genres?type=` (spec 0035): the genres the app's search filter
 * offers, from the same cached TMDB and IGDB lists the web's filter bar and
 * search parser read, so an id the app sends is one the parser accepts.
 * Genre lists barely change, so a CDN may share one answer for a day; a
 * catalog failure is 502 `no-store`.
 */
export const GET = withV1({
  name: "genres.get",
  auth: "public",
  cache: "public, s-maxage=86400",
  input: { query: v1GenresQuerySchema },
  handler: async ({ input }) => {
    const { type } = input.query;
    try {
      const genres = await READS[type]();
      const body: V1Genres = {
        type,
        genres: genres.map(({ id, name }) => ({ id, name })),
      };
      return v1Ok(body);
    } catch (error) {
      return catalogFailure(error);
    }
  },
});
