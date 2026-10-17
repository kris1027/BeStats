/**
 * The one error type every IGDB read raises, so a caller branches on a `kind`
 * rather than on a status code or a message string (spec 0023, AC-7).
 */
export type IgdbErrorKind =
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "bad_response";

/**
 * A failed IGDB or Twitch read.
 *
 * `endpoint` is the IGDB endpoint name (`games`, `genres`) or `token`, never a
 * URL, a request body or anything carrying a credential, because errors end up
 * in logs and error overlays (AC-3, AC-7, AC-17).
 */
export class IgdbError extends Error {
  readonly kind: IgdbErrorKind;
  readonly status: number | null;
  readonly endpoint: string;

  constructor(
    kind: IgdbErrorKind,
    endpoint: string,
    message: string,
    status: number | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "IgdbError";
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = status;
  }
}

/**
 * A bad input: a caller bug or a bad URL value, thrown before any request
 * (AC-12b).
 *
 * Separate from `IgdbError` on purpose. It is never sent to IGDB and never
 * cached, so a page can answer it as its own mistake (a 404 for a bad URL
 * value) instead of an IGDB outage. `field` names the input, never its value.
 */
export class IgdbValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "IgdbValidationError";
    this.field = field;
  }
}

/**
 * True when a value is an IGDB "this game does not exist" failure.
 *
 * The one way a page turns a missing game into `notFound()` (AC-7). A hand
 * rolled catch would swallow a timeout or a rate limit as if the game were
 * missing.
 *
 * @param error Any caught value.
 * @returns True only for an `IgdbError` whose kind is `not_found`.
 */
export function isIgdbNotFound(error: unknown): boolean {
  return error instanceof IgdbError && error.kind === "not_found";
}

/**
 * True when a `fetch` failed because its `AbortSignal.timeout` fired.
 *
 * Both IGDB and Twitch requests map this to `timeout`, which is never retried
 * (spec 0023, AC-3, AC-6), so the one test lives here rather than in each
 * caller. Node names a timed out signal `TimeoutError` and a manual abort
 * `AbortError`; either means the request did not finish in time.
 */
export function isAbortError(caught: unknown): boolean {
  return (
    caught instanceof Error &&
    (caught.name === "TimeoutError" || caught.name === "AbortError")
  );
}
