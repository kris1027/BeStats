import {
  V1_MORE_LIKE_THIS_LIMIT,
  type V1SimilarGames,
} from "@bestats/core/api/v1/extras";
import { gameIdParamSchema } from "@bestats/core/api/v1/game";
import { z } from "zod";

import { catalogFailure, itemFromGame } from "@/lib/api/v1/browse";
import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { type GameSummary, getGamesByIds } from "@/lib/igdb";
import { loadGame } from "@/lib/igdb/load-game";

/**
 * `GET /api/v1/games/{id}/similar` (prompts/mobile-look-title-extras.md,
 * decision 3): the game's More like this as cards, built exactly as the
 * web's section (spec 0031, AC-8): one cached batch read of IGDB's similar
 * ids, the game's own order kept (`found` has none), missing and hidden games
 * dropped before the cap, so a hidden game never costs a slot.
 *
 * Public and anonymous; nothing depends on who asks, so a CDN may share one
 * answer for five minutes (AGENTS.md section 11). A hidden or unknown game is
 * 404, an IGDB failure 502, both `no-store`.
 */
export const GET = withV1({
  name: "games.similar",
  auth: "public",
  cache: "public, s-maxage=300, stale-while-revalidate=600",
  input: { params: z.object({ id: gameIdParamSchema }) },
  handler: async ({ input }) => {
    const loaded = await loadGame(input.params.id);
    if (loaded.kind === "not_found") return v1Fail("not_found");
    if (loaded.kind === "failed") return v1Fail("catalog_unavailable");

    const ids = loaded.game.similarGameIds;
    let found: GameSummary[] = [];
    if (ids.length > 0) {
      try {
        ({ found } = await getGamesByIds(ids));
      } catch (error) {
        return catalogFailure(error);
      }
    }
    const byId = new Map(found.map((game) => [game.id, game]));
    const results = ids
      .map((id) => byId.get(id))
      .filter((game): game is GameSummary => game !== undefined && !game.hidden)
      .slice(0, V1_MORE_LIKE_THIS_LIMIT)
      .map(itemFromGame);
    const body: V1SimilarGames = { results };
    return v1Ok(body);
  },
});
