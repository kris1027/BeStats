import { movieIdParamSchema, type V1Movie } from "@bestats/core/api/v1/movie";
import { z } from "zod";

import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { loadMovie } from "@/lib/tmdb/load-movie";

/**
 * `GET /api/v1/movies/{id}` (spec 0033, child 0035): a movie's catalog
 * detail for the app's movie screen.
 *
 * Public and anonymous: it reads the id and nothing else (no cookie, no
 * bearer header), through the same cached `loadMovie` the web page uses, so a
 * CDN may share one answer for five minutes and TMDB is asked once per cache
 * lifetime. An adult or unknown movie is 404, a TMDB failure 502, both
 * `no-store`. Public catalog data is cached apart from user state (AGENTS.md
 * sections 7 and 11).
 */
export const GET = withV1({
  name: "movies.get",
  auth: "public",
  cache: "public, s-maxage=300, stale-while-revalidate=600",
  input: { params: z.object({ id: movieIdParamSchema }) },
  handler: async ({ input }) => {
    const loaded = await loadMovie(input.params.id);
    if (loaded.kind === "not_found") return v1Fail("not_found");
    if (loaded.kind === "failed") return v1Fail("catalog_unavailable");

    const movie = loaded.movie;
    const body: V1Movie = {
      id: movie.id,
      title: movie.title,
      originalTitle: movie.originalTitle,
      overview: movie.overview,
      tagline: movie.tagline,
      releaseDate: movie.releaseDate,
      releaseYear: movie.releaseYear,
      runtimeMinutes: movie.runtimeMinutes,
      status: movie.status,
      genres: movie.genres,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      tmdbRating: movie.tmdbRating,
      tmdbVoteCount: movie.tmdbVoteCount,
      directors: movie.directors,
      cast: movie.cast,
    };
    return v1Ok(body);
  },
});
