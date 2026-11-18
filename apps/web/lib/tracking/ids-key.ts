/**
 * The one way a set of ids becomes a React `cache()` key, shared by every
 * per request read that serves a whole grid or season at once (the movie,
 * game and show grids, a season's episodes). `cache()` compares arguments by
 * identity, so only a primitive lets every card or row on a page share one
 * read: the same ids in any order, with repeats, give the same key.
 *
 * Pure and free of `server-only`, so the slots and their tests use the real
 * key instead of a copy of it.
 *
 * @param ids The ids on the page.
 */
export function idsKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

/**
 * The ids back out of a key from `idsKey`, inside the cached read. The empty
 * key is no ids, so the read can skip its query.
 *
 * @param key A key built by `idsKey`.
 */
export function parseIdsKey(key: string): number[] {
  return key === "" ? [] : key.split(",").map(Number);
}
