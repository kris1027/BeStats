import type { V1TitleExtras } from "@bestats/core/api/v1/extras";
import { showIdParamSchema } from "@bestats/core/api/v1/show";
import { z } from "zod";

import { extrasForRegion } from "@/lib/api/v1/extras";
import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { regionFromHeaders } from "@/lib/region";
import { getTvExtras, TmdbError, type TvExtras } from "@/lib/tmdb";
import { loadShow } from "@/lib/tmdb/load-show";

/**
 * `GET /api/v1/shows/{id}/extras` (prompts/mobile-look-title-extras.md): the
 * trailer, age rating, Where to watch and More like this of the app's show
 * screen, from the same cached `getTvExtras` the web page reads.
 *
 * The age rating and providers are picked for the connection's country
 * (decision 1), so a success is `private`: a CDN never hands one country's
 * answer to another. TMDB is still asked once per cache lifetime, since the
 * read underneath is cached for every country. An unknown or adult show is
 * 404, a TMDB failure of either read 502, both `no-store`.
 */
export const GET = withV1({
  name: "shows.extras",
  auth: "public",
  cache: "private, max-age=300",
  input: { params: z.object({ id: showIdParamSchema }) },
  handler: async ({ request, input }) => {
    const id = input.params.id;
    // The title read decides whether the show exists (an adult title is 404,
    // as on its detail route); both reads are cached and run side by side.
    const [loaded, extras] = await Promise.all([
      loadShow(id),
      getTvExtras(id).then(
        (value): TvExtras | Error => value,
        (error: unknown) => {
          if (error instanceof TmdbError) return error;
          throw error;
        },
      ),
    ]);
    if (loaded.kind === "not_found") return v1Fail("not_found");
    if (loaded.kind === "failed" || extras instanceof Error) {
      return v1Fail("catalog_unavailable");
    }
    const body: V1TitleExtras = extrasForRegion(
      extras,
      regionFromHeaders(request.headers),
    );
    return v1Ok(body);
  },
});
