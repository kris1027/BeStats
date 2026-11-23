import { showIdParamSchema, type V1Show } from "@bestats/core/api/v1/show";
import { z } from "zod";

import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { getShowCast, TmdbError } from "@/lib/tmdb";
import { loadShow } from "@/lib/tmdb/load-show";

/**
 * The series cast, or null when only that read failed: the web shows the
 * show with a cast error line in that case (spec 0009, AC-8), so the app's
 * show must not fail with it either. Any other error is a bug and throws.
 */
async function showCastOrNull(id: number) {
  try {
    return await getShowCast(id);
  } catch (error) {
    if (error instanceof TmdbError) return null;
    throw error;
  }
}

/**
 * `GET /api/v1/shows/{id}` (spec 0035): a show's catalog detail and season
 * list for the app's show screen, through the same cached `loadShow` the web
 * page uses. Public and anonymous; `s-maxage=60` because status and air
 * dates are time sensitive (AGENTS.md section 12). An adult or unknown show
 * is 404, a TMDB failure 502, both `no-store`. The series cast is read beside
 * it from its own day long cache (feature 29, slice 2); a cast failure alone
 * answers `cast: null`, never a failed show.
 */
export const GET = withV1({
  name: "shows.get",
  auth: "public",
  cache: "public, s-maxage=60",
  input: { params: z.object({ id: showIdParamSchema }) },
  handler: async ({ input }) => {
    const [loaded, cast] = await Promise.all([
      loadShow(input.params.id),
      showCastOrNull(input.params.id),
    ]);
    if (loaded.kind === "not_found") return v1Fail("not_found");
    if (loaded.kind === "failed") return v1Fail("catalog_unavailable");

    const show = loaded.show;
    const body: V1Show = {
      id: show.id,
      name: show.name,
      overview: show.overview,
      tagline: show.tagline,
      posterUrl: show.posterUrl,
      backdropUrl: show.backdropUrl,
      firstAirDate: show.firstAirDate,
      firstAirYear: show.firstAirYear,
      lastAirDate: show.lastAirDate,
      status: show.status,
      inProduction: show.inProduction,
      numberOfSeasons: show.numberOfSeasons,
      numberOfEpisodes: show.numberOfEpisodes,
      genres: show.genres,
      createdBy: show.createdBy,
      tmdbRating: show.tmdbRating,
      tmdbVoteCount: show.tmdbVoteCount,
      seasons: show.seasons.map((season) => ({
        seasonNumber: season.seasonNumber,
        name: season.name,
        episodeCount: season.episodeCount,
        airDate: season.airDate,
        posterUrl: season.posterUrl,
        isSpecials: season.isSpecials,
      })),
      lastEpisodeToAir: show.lastEpisodeToAir,
      nextEpisodeToAir: show.nextEpisodeToAir,
      originalLanguage: show.originalLanguage,
      type: show.type,
      networks: show.networks,
      productionCompanies: show.productionCompanies,
      cast,
    };
    return v1Ok(body);
  },
});
