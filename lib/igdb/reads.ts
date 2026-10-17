import "server-only";
import { cacheLife } from "next/cache";
import { fetchGamesByIds } from "./batch";
import { fetchDiscoverGames } from "./discover";
import { fetchGame } from "./games";
import { fetchGameGenres, fetchGamePlatforms } from "./reference";
import {
  failureProfile,
  type IgdbFailure,
  type IgdbResult,
  toFailure,
  unwrap,
} from "./result";
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
  canonicalGameIds,
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

function cacheFailure(failure: IgdbFailure): void {
  if (failureProfile(failure.kind) === "seconds") {
    cacheLife("seconds");
  } else {
    cacheLife("minutes");
  }
}

async function getGameCached(id: number): Promise<IgdbResult<Game>> {
  "use cache";
  try {
    const value = await fetchGame(id);
    cacheLife("hours");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getGame(id: number): Promise<Game> {
  return unwrap(await getGameCached(assertGameId(id)));
}

/** Keyed on the deduped, sorted ids, so `[3, 1]` and `[1, 3, 3]` share one. */
async function getGamesByIdsCached(
  ids: number[],
): Promise<IgdbResult<BatchResult<GameSummary>>> {
  "use cache";
  try {
    const value = await fetchGamesByIds(ids);
    cacheLife("hours");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getGamesByIds(
  ids: readonly number[],
): Promise<BatchResult<GameSummary>> {
  const canonical = canonicalGameIds(ids);
  if (canonical.length === 0) return { found: [], missingIds: [] };
  return unwrap(await getGamesByIdsCached(canonical));
}

async function searchGamesCached(
  options: SearchGamesOptions,
): Promise<IgdbResult<Paged<GameSummary>>> {
  "use cache";
  try {
    const value = await fetchSearchGames(options);
    cacheLife("minutes");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function searchGames(
  options: SearchGamesOptions,
): Promise<Paged<GameSummary>> {
  return unwrap(await searchGamesCached(validateSearchOptions(options)));
}

async function discoverGamesCached(
  options: DiscoverGamesOptions,
): Promise<IgdbResult<Paged<GameSummary>>> {
  "use cache";
  try {
    const value = await fetchDiscoverGames(options);
    cacheLife("minutes");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function discoverGames(
  options: DiscoverGamesOptions,
): Promise<Paged<GameSummary>> {
  return unwrap(await discoverGamesCached(validateDiscoverOptions(options)));
}

async function getGameGenresCached(): Promise<IgdbResult<GameRef[]>> {
  "use cache";
  try {
    const value = await fetchGameGenres();
    cacheLife("max");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getGameGenres(): Promise<GameRef[]> {
  return unwrap(await getGameGenresCached());
}

async function getGamePlatformsCached(): Promise<IgdbResult<GameRef[]>> {
  "use cache";
  try {
    const value = await fetchGamePlatforms();
    cacheLife("max");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getGamePlatforms(): Promise<GameRef[]> {
  return unwrap(await getGamePlatformsCached());
}
