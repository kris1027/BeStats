import "server-only";
import type { z } from "zod";
import {
  TMDB_API_BASE,
  TMDB_LANGUAGE,
  TMDB_MAX_ATTEMPTS,
  TMDB_RETRY_DELAYS_MS,
  TMDB_TIMEOUT_MS,
} from "./constants";
import { getTmdbToken } from "./env";
import { TmdbError, type TmdbErrorKind } from "./errors";

/** Query values a caller may send. `undefined` entries are dropped. */
export type TmdbQuery = Record<
  string,
  string | number | boolean | undefined | null
>;

/**
 * One structured failure record.
 *
 * Only the fields spec 0002's AC-21 names: no `Authorization` header, no token,
 * no user identifier. There is no user identifier to leak here anyway, because
 * this module never sees one.
 */
type TmdbLogRecord = {
  event: "tmdb_request_failed" | "tmdb_request_retry";
  endpoint: string;
  status: number | null;
  kind: TmdbErrorKind;
  attempt: number;
  elapsedMs: number;
};

function logTmdbFailure(record: TmdbLogRecord): void {
  // Server side only, and only on failure: a successful read is not logged, so
  // normal traffic does not fill the log with noise (spec 0002, AC-21).
  console.warn(JSON.stringify(record));
}

/**
 * Maps an HTTP status to the error contract callers branch on.
 *
 * A 404 becomes `not_found` specifically so a page can turn a missing title
 * into Next's `notFound()` through `isTmdbNotFound` (spec 0002, AC-10).
 */
function kindForStatus(status: number): TmdbErrorKind {
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  return "upstream";
}

/**
 * Whether another attempt is worth making.
 *
 * A 401 and a 404 are answers, not accidents: retrying them wastes the user's
 * time and TMDB's budget, so they cost exactly one attempt (spec 0002, AC-12).
 * A timeout is also not retried: its deadline has already consumed the render's
 * latency budget, and a second 8 second wait would hurt the page more than the
 * failure does.
 */
function isRetryable(kind: TmdbErrorKind): boolean {
  return kind === "rate_limited" || kind === "upstream";
}

/**
 * How long to wait before the next attempt.
 *
 * TMDB's documentation does not say whether a 429 carries `Retry-After`, so
 * both paths exist: honour the header when it is there, fall back to a short
 * backoff when it is not. Jitter keeps parallel reads from retrying in lockstep
 * and hammering TMDB at the same instant.
 */
function retryDelayMs(response: Response | null, attempt: number): number {
  const header = response?.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 10_000);
    }
    const dateMs = Date.parse(header);
    if (Number.isFinite(dateMs)) {
      return Math.min(Math.max(dateMs - Date.now(), 0), 10_000);
    }
  }
  const base =
    TMDB_RETRY_DELAYS_MS[attempt - 1] ??
    TMDB_RETRY_DELAYS_MS[TMDB_RETRY_DELAYS_MS.length - 1];
  return base + Math.floor(Math.random() * base * 0.5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the request URL. The credential is never part of it (AC-3); TMDB's v4
 * token travels in the `Authorization` header instead of the legacy `api_key`
 * query parameter precisely so it cannot end up in a log or a referrer.
 */
function buildUrl(endpoint: string, query: TmdbQuery): string {
  const url = new URL(`${TMDB_API_BASE}${endpoint}`);
  url.searchParams.set("language", TMDB_LANGUAGE);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Performs one authenticated TMDB read and returns validated, still raw data.
 *
 * Every TMDB request in the app goes through here, so auth, the deadline, the
 * retry budget, the status mapping and the failure logging are decided once
 * rather than re-invented per endpoint (spec 0002, the module's whole reason to
 * exist). Normalization happens in the caller; this function's job ends at "the
 * response is shaped the way the app expects".
 *
 * @param endpoint The TMDB path, for example `/movie/550`. Used verbatim in
 * errors and logs, which is safe because it carries no credential.
 * @param query Extra query parameters. `language` is always added.
 * @param schema The Zod schema for the fields the app reads. No schema uses
 * `.strict()`, so keys TMDB adds later are ignored rather than fatal (AC-8).
 * @returns The parsed response.
 * @throws {TmdbError} `not_found`, `unauthorized`, `rate_limited`, `timeout`,
 * `upstream` or `bad_response`.
 */
export async function tmdbRequest<T>(
  endpoint: string,
  query: TmdbQuery,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = buildUrl(endpoint, query);
  let lastError: TmdbError | null = null;

  for (let attempt = 1; attempt <= TMDB_MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    let response: Response | null = null;
    let error: TmdbError | null = null;

    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${getTmdbToken()}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
      });

      if (!response.ok) {
        const kind = kindForStatus(response.status);
        error = new TmdbError(
          kind,
          endpoint,
          `TMDB responded ${response.status} for ${endpoint}`,
          response.status,
        );
      }
    } catch (caught) {
      const aborted =
        caught instanceof Error &&
        (caught.name === "TimeoutError" || caught.name === "AbortError");
      error = new TmdbError(
        aborted ? "timeout" : "upstream",
        endpoint,
        aborted
          ? `TMDB did not respond within ${TMDB_TIMEOUT_MS}ms for ${endpoint}`
          : `TMDB request failed for ${endpoint}`,
        null,
        { cause: caught },
      );
    }

    if (error === null && response !== null) {
      // A body that is not JSON at all is an upstream problem rather than a
      // schema problem, so it is reported as such and never retried into a
      // confusing `bad_response`.
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (caught) {
        const jsonError = new TmdbError(
          "upstream",
          endpoint,
          `TMDB returned a body that is not JSON for ${endpoint}`,
          response.status,
          { cause: caught },
        );
        logTmdbFailure({
          event: "tmdb_request_failed",
          endpoint,
          status: response.status,
          kind: "upstream",
          attempt,
          elapsedMs: Date.now() - startedAt,
        });
        throw jsonError;
      }

      const parsed = schema.safeParse(payload);
      if (parsed.success) return parsed.data;

      // A required field TMDB did not send is not something a retry fixes, and
      // returning a partial object would put invented data on a page, so this
      // raises with nothing partial (spec 0002, AC-9).
      logTmdbFailure({
        event: "tmdb_request_failed",
        endpoint,
        status: response.status,
        kind: "bad_response",
        attempt,
        elapsedMs: Date.now() - startedAt,
      });
      throw new TmdbError(
        "bad_response",
        endpoint,
        `TMDB response did not match the expected shape for ${endpoint}: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`,
        response.status,
        { cause: parsed.error },
      );
    }

    const failure = error as TmdbError;
    const elapsedMs = Date.now() - startedAt;
    const canRetry = isRetryable(failure.kind) && attempt < TMDB_MAX_ATTEMPTS;

    logTmdbFailure({
      event: canRetry ? "tmdb_request_retry" : "tmdb_request_failed",
      endpoint,
      status: failure.status,
      kind: failure.kind,
      attempt,
      elapsedMs,
    });

    if (!canRetry) throw failure;

    lastError = failure;
    await sleep(retryDelayMs(response, attempt));
  }

  // Unreachable in practice: the loop either returns, throws, or retries until
  // the last attempt throws. Kept so the function has no implicit undefined.
  throw (
    lastError ??
    new TmdbError("upstream", endpoint, `TMDB read failed for ${endpoint}`)
  );
}
