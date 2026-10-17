import "server-only";
import { igdbRequest } from "./client";
import { IGDB_BATCH_LIMIT } from "./constants";
import { buildQuery } from "./query";
import { recordsSchema, refSchema } from "./schemas";
import type { GameRef } from "./types";

/**
 * The genre and platform lists G7's filters offer and a card names its ids
 * from (spec 0023, AC-14). One request each; IGDB has a few dozen genres and a
 * few hundred platforms, under the 500 a query can return. A nameless row is
 * dropped. Sorted by name here as well as by IGDB, so the order never depends
 * on IGDB's collation.
 */
async function fetchRefs(endpoint: "genres" | "platforms"): Promise<GameRef[]> {
  const { data } = await igdbRequest(
    endpoint,
    buildQuery({ fields: ["name"], sort: "name asc", limit: IGDB_BATCH_LIMIT }),
    recordsSchema,
  );
  const refs: GameRef[] = [];
  for (const record of data) {
    const parsed = refSchema.safeParse(record);
    if (parsed.success) refs.push(parsed.data);
  }
  return refs.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export function fetchGameGenres(): Promise<GameRef[]> {
  return fetchRefs("genres");
}

export function fetchGamePlatforms(): Promise<GameRef[]> {
  return fetchRefs("platforms");
}
