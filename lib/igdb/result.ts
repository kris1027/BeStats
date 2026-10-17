import "server-only";
import { IgdbError, type IgdbErrorKind } from "./errors";

/**
 * How an IGDB failure survives a `use cache` boundary (spec 0023, AC-7).
 *
 * Next serializes whatever leaves a cached scope, and a thrown `IgdbError`
 * arrives as a bare `Error` with no `kind`, which would break
 * `isIgdbNotFound`. The same lesson as `lib/tmdb/result.ts`: a cached read
 * returns this plain object and the uncached wrapper rebuilds the error on
 * this side of the boundary.
 */
export type IgdbFailure = {
  kind: IgdbErrorKind;
  status: number | null;
  endpoint: string;
  message: string;
};

export type IgdbResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: IgdbFailure };

/**
 * Flattens an `IgdbError` into a cacheable object.
 *
 * Anything else is rethrown: an unexpected crash (or an `IgdbValidationError`,
 * which `reads.ts` raises before entering a cached scope) is not an IGDB
 * outcome, and caching it under an IGDB kind would disguise it.
 *
 * @throws The original value when it is not an `IgdbError`.
 */
export function toFailure(error: unknown): IgdbFailure {
  if (!(error instanceof IgdbError)) {
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
 * @throws {IgdbError} Carrying the original kind, status and endpoint.
 */
export function unwrap<T>(result: IgdbResult<T>): T {
  if (result.ok) {
    return result.value;
  }
  const { kind, endpoint, message, status } = result.failure;
  throw new IgdbError(kind, endpoint, message, status);
}

/**
 * The lifetime a failed read is cached for, by kind (AC-7).
 *
 * A transient failure gets `seconds`, so a page's Try again really retries; a
 * settled answer (a game IGDB lacks, a bad credential, a payload that fails
 * validation) gets `minutes`, which still absorbs a burst. The same rule as
 * TMDB's `failureProfile`, kept separate because the modules share no code.
 */
export function failureProfile(kind: IgdbErrorKind): "seconds" | "minutes" {
  switch (kind) {
    case "timeout":
    case "rate_limited":
    case "upstream":
      return "seconds";
    case "not_found":
    case "unauthorized":
    case "bad_response":
      return "minutes";
  }
}
