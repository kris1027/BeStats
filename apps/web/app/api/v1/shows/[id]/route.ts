import { showIdParamSchema, type V1Show } from "@bestats/core/api/v1/show";
import { z } from "zod";

import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { loadShow } from "@/lib/tmdb/load-show";

/**
 * `GET /api/v1/shows/{id}` (spec 0035): a show's catalog detail and season
 * list for the app's show screen, through the same cached `loadShow` the web
 * page uses. Public and anonymous; `s-maxage=60` because status and air
 * dates are time sensitive (AGENTS.md section 12). An adult or unknown show
 * is 404, a TMDB failure 502, both `no-store`.
 */
export const GET = withV1({
  name: "shows.get",
  auth: "public",
  cache: "public, s-maxage=60",
  input: { params: z.object({ id: showIdParamSchema }) },
  handler: async ({ input }) => {
    const loaded = await loadShow(input.params.id);
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
    };
    return v1Ok(body);
  },
});
