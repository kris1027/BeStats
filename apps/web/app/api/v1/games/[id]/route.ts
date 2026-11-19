import { gameIdParamSchema, type V1Game } from "@bestats/core/api/v1/game";
import { z } from "zod";

import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { loadGame } from "@/lib/igdb/load-game";

/**
 * `GET /api/v1/games/{id}` (spec 0035): a game's catalog detail for the app's
 * game screen, through the same cached `loadGame` the web page uses, so the
 * two can never disagree on whether a game exists. Public and anonymous; a
 * CDN may share one answer for five minutes, cached apart from user state
 * (AGENTS.md section 11). A hidden or unknown game is 404, as the web page's
 * soft 404 is; an IGDB failure is 502, both `no-store`.
 *
 * Every field but `hidden` passes through as the shared `Game` normalizer
 * built it, so image URLs are IGDB's own at their ceiling size (spec 0035,
 * Images) and nothing is invented (AGENTS.md section 14).
 */
export const GET = withV1({
  name: "games.get",
  auth: "public",
  cache: "public, s-maxage=300, stale-while-revalidate=600",
  input: { params: z.object({ id: gameIdParamSchema }) },
  handler: async ({ input }) => {
    const loaded = await loadGame(input.params.id);
    if (loaded.kind === "not_found") return v1Fail("not_found");
    if (loaded.kind === "failed") return v1Fail("catalog_unavailable");

    const { hidden: _hidden, ...game } = loaded.game;
    const body: V1Game = game;
    return v1Ok(body);
  },
});
