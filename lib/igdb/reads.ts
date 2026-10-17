import "server-only";
import { cacheLife } from "next/cache";
import { fetchGamesByIds } from "./batch";
import { fetchDiscoverGames } from "./discover";
import { fetchGame } from "./games";
import { fetchGameGenres, fetchGamePlatforms } from "./reference";
import { failureProfile, type IgdbResult, toFailure, unwrap } from "./result";
import { fetchSearchGames } from "./search";
import type {
  BatchResult,
  DiscoverGamesOptions,
  Game,
  GameRef,
  GameSummary,
  Paged,
  SearchGamesOptions,
} from "./types";
import {
  assertGameId,
  type CanonicalGameIds,
  canonicalGameIds,
  type GameId,
  type ValidDiscoverOptions,
  type ValidSearchOptions,
  validateDiscoverOptions,
  validateSearchOptions,
} from "./validation";

/**
 * The cached half of every IGDB read, and the only file that imports
 * `next/cache` (spec 0023, AC-7, AC-8).
 *
 * Each read is a pair, as in `lib/tmdb/reads.ts`: an inner uncached function
 * the tests call, and a thin exported wrapper here. The wrapper validates
 * first, outside any cached scope, so a bad input throws
 * `IgdbValidationError` and is never cached (AC-12b); it then calls a cached
 * function that returns an `IgdbResult` and unwraps it on this side of the
 * boundary, which keeps `IgdbError` and its `kind` intact.
 *
 * Lifetimes follow how fast each answer changes: `hours` for a game and a
 * batch, so a new release date unlocks Playing within hours; `minutes` for
 * search and discover; `max` for the genre and platform lists. A failure takes
 * `failureProfile(kind)`.
 *
 * No cached scope reads cookies, headers, search params or any user value. A
 * batch key holds catalog ids only, and the token and limiter live in memory,
 * never in a cache entry.
 */

type Lifetime = "seconds" | "minutes" | "hours" | "max";

/** One literal call per profile, since `cacheLife` is typed per literal. */
function setLifetime(profile: Lifetime): void {
  if (profile === "seconds") cacheLife("seconds");
  else if (profile === "minutes") cacheLife("minutes");
  else if (profile === "hours") cacheLife("hours");
  else cacheLife("max");
}

/**
 * Runs one inner read and turns its outcome into a plain `IgdbResult`, setting
 * the entry's lifetime on the way: `profile` on success, `failureProfile(kind)`
 * on failure. Called only from inside a `use cache` function, so `cacheLife`
 * still lands in that read's own scope (root `AGENTS.md`, "Commands and repo
 * facts"); keeping the try and catch here means no read can forget one half.
 */
async function settle<T>(
  read: () => Promise<T>,
  profile: Exclude<Lifetime, "seconds">,
): Promise<IgdbResult<T>> {
  try {
    const value = await read();
    setLifetime(profile);
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    setLifetime(failureProfile(failure.kind));
    return { ok: false, failure };
  }
}

async function getGameCached(id: GameId): Promise<IgdbResult<Game>> {
  "use cache";
  return settle(() => fetchGame(id), "hours");
}

export async function getGame(id: number): Promise<Game> {
  return unwrap(await getGameCached(assertGameId(id)));
}

/** Keyed on the deduped, sorted ids, so `[3, 1]` and `[1, 3, 3]` share one. */
async function getGamesByIdsCached(
  ids: CanonicalGameIds,
): Promise<IgdbResult<BatchResult<GameSummary>>> {
  "use cache";
  return settle(() => fetchGamesByIds(ids), "hours");
}

export async function getGamesByIds(
  ids: readonly number[],
): Promise<BatchResult<GameSummary>> {
  const canonical = canonicalGameIds(ids);
  if (canonical.length === 0) return { found: [], missingIds: [] };
  return unwrap(await getGamesByIdsCached(canonical));
}

async function searchGamesCached(
  options: ValidSearchOptions,
): Promise<IgdbResult<Paged<GameSummary>>> {
  "use cache";
  return settle(() => fetchSearchGames(options), "minutes");
}

export async function searchGames(
  options: SearchGamesOptions,
): Promise<Paged<GameSummary>> {
  return unwrap(await searchGamesCached(validateSearchOptions(options)));
}

async function discoverGamesCached(
  options: ValidDiscoverOptions,
): Promise<IgdbResult<Paged<GameSummary>>> {
  "use cache";
  return settle(() => fetchDiscoverGames(options), "minutes");
}

export async function discoverGames(
  options: DiscoverGamesOptions,
): Promise<Paged<GameSummary>> {
  return unwrap(await discoverGamesCached(validateDiscoverOptions(options)));
}

async function getGameGenresCached(): Promise<IgdbResult<GameRef[]>> {
  "use cache";
  return settle(() => fetchGameGenres(), "max");
}

export async function getGameGenres(): Promise<GameRef[]> {
  return unwrap(await getGameGenresCached());
}

async function getGamePlatformsCached(): Promise<IgdbResult<GameRef[]>> {
  "use cache";
  return settle(() => fetchGamePlatforms(), "max");
}

export async function getGamePlatforms(): Promise<GameRef[]> {
  return unwrap(await getGamePlatformsCached());
}
