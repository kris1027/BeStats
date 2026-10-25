import "server-only";
import { fetchGamesByIds } from "./batch";
import { igdbRequest } from "./client";
import { IGDB_BATCH_LIMIT, IGDB_POPULARITY_TYPES } from "./constants";
import { buildQuery, cond } from "./query";
import { popularityPrimitiveSchema, recordsSchema } from "./schemas";
import type { GameSummary, PopularGamesKind } from "./types";
import { canonicalGameIds, type ValidPopularKind } from "./validation";

/**
 * A popularity list, the source of the games landing's Trending and Popular
 * (spec 0028, AC-4).
 *
 * IGDB ranks games in `popularity_primitives`, one row per game and
 * popularity type, with ids only. So the read is two requests: the top 500
 * rows of one type, then those games through the batch read. A hidden game
 * (the catalog filter, evaluated on a read by id) and one the batch did not
 * return are dropped, which can only shorten the list, never fail it. The
 * rest keep the primitives' rank order, and since the whole visible list is
 * known its length is an exact count.
 *
 * Both requests run inside one cached function in `reads.ts`, so a failure of
 * either is one failure and a half read list is never cached as a success.
 *
 * @param kind Checked by `assertPopularKind` in `reads.ts`, before the cache.
 * @returns At most 500 visible games, in rank order, each once.
 */
export async function fetchPopularGames(
  kind: ValidPopularKind,
): Promise<GameSummary[]> {
  // The brand blocks indexing by a branded string; the plain kind does not.
  const plainKind: PopularGamesKind = kind;
  const { data } = await igdbRequest(
    "popularity_primitives",
    buildQuery({
      fields: ["game_id", "value"],
      where: [cond.is("popularity_type", IGDB_POPULARITY_TYPES[plainKind].id)],
      sort: { field: "value", direction: "desc" },
      limit: IGDB_BATCH_LIMIT,
    }),
    recordsSchema,
  );

  const ranked: number[] = [];
  const seen = new Set<number>();
  for (const row of data) {
    const parsed = popularityPrimitiveSchema.safeParse(row);
    if (!parsed.success || seen.has(parsed.data.game_id)) continue;
    seen.add(parsed.data.game_id);
    ranked.push(parsed.data.game_id);
  }

  const { found } = await fetchGamesByIds(canonicalGameIds(ranked));
  const byId = new Map(found.map((game) => [game.id, game]));
  return ranked
    .map((id) => byId.get(id))
    .filter((game): game is GameSummary => game !== undefined && !game.hidden);
}
