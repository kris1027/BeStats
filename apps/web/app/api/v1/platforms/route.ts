import type { V1Platforms } from "@bestats/core/api/v1/browse";

import { catalogFailure } from "@/lib/api/v1/browse";
import { v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { getGamePlatforms } from "@/lib/igdb";

/**
 * `GET /api/v1/platforms` (prompts/mobile-look-search.md, decision 4): the
 * platforms the app's games filter offers, from the same cached IGDB list
 * the web's filter bar and the search parser read, so a `platform` id the
 * app sends is one `/api/v1/search` accepts (spec 0029, AC-10). The list
 * barely changes, so a CDN may share one answer for a day, as `/genres`
 * does; a catalog failure is 502 `no-store` (AGENTS.md section 12).
 */
export const GET = withV1({
  name: "platforms.get",
  auth: "public",
  cache: "public, s-maxage=86400",
  handler: async () => {
    try {
      const platforms = await getGamePlatforms();
      const body: V1Platforms = {
        platforms: platforms.map(({ id, name }) => ({ id, name })),
      };
      return v1Ok(body);
    } catch (error) {
      return catalogFailure(error);
    }
  },
});
