import {
  seasonNumberParamSchema,
  showIdParamSchema,
  type V1Season,
} from "@bestats/core/api/v1/show";
import { z } from "zod";

import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { loadSeason } from "@/lib/tmdb/load-season";

/**
 * `GET /api/v1/shows/{id}/seasons/{n}` (spec 0035): a season with its
 * episodes and air dates, through the cached `loadSeason` the web season page
 * uses. Public, `s-maxage=60` because new episodes and dates change (AGENTS.md
 * section 12). An unknown show or season is 404, a TMDB failure 502.
 */
export const GET = withV1({
  name: "shows.seasons.get",
  auth: "public",
  cache: "public, s-maxage=60",
  input: {
    params: z.object({ id: showIdParamSchema, n: seasonNumberParamSchema }),
  },
  handler: async ({ input }) => {
    const loaded = await loadSeason(input.params.id, input.params.n);
    if (loaded.kind === "failed") return v1Fail("catalog_unavailable");
    if (loaded.kind !== "found") return v1Fail("not_found");

    const { show, season } = loaded;
    const body: V1Season = {
      show: { id: show.id, name: show.name },
      seasonNumber: season.seasonNumber,
      name: season.name,
      overview: season.overview,
      airDate: season.airDate,
      posterUrl: season.posterUrl,
      episodes: season.episodes.map((episode) => ({
        id: episode.id,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
        overview: episode.overview,
        airDate: episode.airDate,
        stillUrl: episode.stillUrl,
        runtimeMinutes: episode.runtimeMinutes,
        tmdbRating: episode.tmdbRating,
      })),
    };
    return v1Ok(body);
  },
});
