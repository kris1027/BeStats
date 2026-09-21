/**
 * The one error type every TMDB read raises, so a caller branches on a `kind`
 * rather than on a status code or a message string (spec 0002, AC-10).
 */
export type TmdbErrorKind =
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "bad_response";

/**
 * A failed TMDB read.
 *
 * `endpoint` is the TMDB path only, never a full URL and never anything
 * carrying the credential, because errors end up in logs and in error overlays
 * (spec 0002, AC-3 and AC-21).
 */
export class TmdbError extends Error {
  readonly kind: TmdbErrorKind;
  readonly status: number | null;
  readonly endpoint: string;

  constructor(
    kind: TmdbErrorKind,
    endpoint: string,
    message: string,
    status: number | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TmdbError";
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = status;
  }
}

/**
 * True when a value is a TMDB "this title does not exist" failure.
 *
 * Exists so a page turns a missing title into Next's `notFound()` through one
 * shared check (spec 0002, AC-26). Hand rolling `catch (e) { notFound() }` at
 * each call site would swallow a timeout or a rate limit as if the title were
 * missing, which is exactly the bug this prevents.
 *
 * @param error Any caught value.
 * @returns True only for a `TmdbError` whose kind is `not_found`.
 */
export function isTmdbNotFound(error: unknown): boolean {
  return error instanceof TmdbError && error.kind === "not_found";
}
