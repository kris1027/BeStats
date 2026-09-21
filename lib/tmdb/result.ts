import "server-only";
import { TmdbError, type TmdbErrorKind } from "./errors";

/**
 * How a TMDB failure survives a `use cache` boundary.
 *
 * Next serializes whatever leaves a cached scope, and a rejection leaves it
 * through RSC error serialization: the caller receives a plain `Error`, so the
 * `TmdbError` prototype and its `kind` are gone (in production even the message
 * is redacted to a digest). That silently broke both callers that branch on a
 * kind, `isTmdbNotFound` in a page and the `not_found` test in `batch.ts`, so a
 * deleted title rendered a blank page instead of a 404 (spec 0002, AC-10,
 * AC-19, AC-26).
 *
 * A plain object crosses intact, so every cached read returns one of these
 * instead of throwing, and the uncached wrapper around it rebuilds the error on
 * this side of the boundary. Rebuilding rather than rethrowing is what keeps
 * `instanceof` and `kind` true for every caller.
 */
export type TmdbFailure = {
  kind: TmdbErrorKind;
  status: number | null;
  endpoint: string;
  message: string;
};

export type TmdbResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: TmdbFailure };

/**
 * Flattens a `TmdbError` into the plain object a cache entry can hold.
 *
 * Anything that is not a `TmdbError` is rethrown rather than wrapped. An
 * unexpected crash is a bug, not a TMDB outcome, and caching it under a TMDB
 * kind would disguise it; letting it throw also keeps it out of the cache.
 *
 * @param error The value a cached read caught.
 * @returns The serializable failure.
 * @throws The original value when it is not a `TmdbError`.
 */
export function toFailure(error: unknown): TmdbFailure {
  if (!(error instanceof TmdbError)) {
    throw error;
  }
  return {
    kind: error.kind,
    status: error.status,
    endpoint: error.endpoint,
    message: error.message,
  };
}

/**
 * Rebuilds the real error outside the cache scope, or hands back the value.
 *
 * Call this in the uncached wrapper, never inside the cached function, because
 * an error thrown inside the scope is exactly what loses its identity.
 *
 * @param result What the cached read returned.
 * @returns The value when the read succeeded.
 * @throws {TmdbError} Carrying the original kind, status and endpoint.
 */
export function unwrap<T>(result: TmdbResult<T>): T {
  if (result.ok) {
    return result.value;
  }
  const { kind, endpoint, message, status } = result.failure;
  throw new TmdbError(kind, endpoint, message, status);
}
