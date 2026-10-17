import "server-only";
import type { z } from "zod";
import {
  IGDB_API_BASE,
  IGDB_MAX_ATTEMPTS,
  IGDB_READ_DEADLINE_MS,
  IGDB_RETRY_AFTER_CAP_MS,
  IGDB_RETRY_DELAYS_MS,
  IGDB_SLOT_WAIT_MS,
  IGDB_TIMEOUT_MS,
} from "./constants";
import { getIgdbCredentials } from "./env";
import { IgdbError, type IgdbErrorKind } from "./errors";
import { igdbLimiter, type ReleaseSlot, SlotWaitExceeded } from "./limiter";
import { logIgdb } from "./log";
import { getIgdbToken, invalidateIgdbToken } from "./token";

/**
 * The only `fetch` to IGDB (spec 0023, AC-4 to AC-7, AC-17).
 *
 * Every request is a POST of an Apicalypse body with the `Client-ID` and a
 * Bearer token, and every one goes through the shared limiter. This one place
 * decides the deadlines, the retry budget, the 401 refresh, the status mapping
 * and the failure logging, so no read re-invents them.
 *
 * The budget, all from `constants.ts`: a request waits at most 5 s for a slot
 * and then fails `rate_limited` unsent; an attempt has 8 s from holding its
 * slot, body included, and a timeout is never retried; a 429 or 5xx is tried
 * at most 3 times; a 401 drops the token and repeats once; and the whole read
 * gives up as `timeout` after 20 s.
 */

export type IgdbResponse<T> = {
  data: T;
  /** IGDB's `X-Count` header, the match count, or null when it is absent. */
  totalCount: number | null;
};

function kindForStatus(status: number): IgdbErrorKind {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  // Any other 4xx means IGDB could not read the query this module built. A
  // retry cannot fix that, so it is a settled answer, not an outage.
  return "bad_response";
}

function isRetryable(kind: IgdbErrorKind): boolean {
  return kind === "rate_limited" || kind === "upstream";
}

/** `Retry-After` in seconds or as a date, capped; else backoff with jitter. */
function retryDelayMs(response: Response | null, retry: number): number {
  const header = response?.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, IGDB_RETRY_AFTER_CAP_MS);
    }
    const dateMs = Date.parse(header);
    if (Number.isFinite(dateMs)) {
      return Math.min(
        Math.max(dateMs - Date.now(), 0),
        IGDB_RETRY_AFTER_CAP_MS,
      );
    }
  }
  const base =
    IGDB_RETRY_DELAYS_MS[retry - 1] ??
    IGDB_RETRY_DELAYS_MS[IGDB_RETRY_DELAYS_MS.length - 1];
  return base + Math.floor(Math.random() * base * 0.5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbort(caught: unknown): boolean {
  return (
    caught instanceof Error &&
    (caught.name === "TimeoutError" || caught.name === "AbortError")
  );
}

function readTotalCount(response: Response): number | null {
  const header = response.headers.get("x-count");
  if (header === null) return null;
  const count = Number(header);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

/**
 * Resolves with the promise, or fails as `timeout` once the read's deadline
 * passes. The promise itself keeps running, which matters for the shared token
 * request: one caller's deadline must not cancel it for the others.
 */
function withinDeadline<T>(
  promise: Promise<T>,
  deadlineAt: number,
  endpoint: string,
): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return Promise.reject(deadlineError(endpoint));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(deadlineError(endpoint)), remaining);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

function deadlineError(endpoint: string): IgdbError {
  return new IgdbError(
    "timeout",
    endpoint,
    `IGDB read of ${endpoint} gave up after ${IGDB_READ_DEADLINE_MS}ms`,
  );
}

type Outcome =
  | { ok: true; payload: unknown; totalCount: number | null; status: number }
  | { ok: false; error: IgdbError; response: Response | null };

/** One attempt, already holding a slot. Reading the body is inside the deadline. */
async function attempt(
  endpoint: string,
  body: string,
  clientId: string,
  token: string,
  timeoutMs: number,
): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch(`${IGDB_API_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "text/plain",
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (caught) {
    const aborted = isAbort(caught);
    return {
      ok: false,
      response: null,
      error: new IgdbError(
        aborted ? "timeout" : "upstream",
        endpoint,
        aborted
          ? `IGDB did not respond within ${timeoutMs}ms for ${endpoint}`
          : `IGDB request failed for ${endpoint}`,
        null,
        { cause: caught },
      ),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      response,
      error: new IgdbError(
        kindForStatus(response.status),
        endpoint,
        `IGDB responded ${response.status} for ${endpoint}`,
        response.status,
      ),
    };
  }

  let text: string;
  try {
    text = await response.text();
  } catch (caught) {
    const aborted = isAbort(caught);
    return {
      ok: false,
      response,
      error: new IgdbError(
        aborted ? "timeout" : "upstream",
        endpoint,
        aborted
          ? `IGDB did not finish its response within ${timeoutMs}ms for ${endpoint}`
          : `IGDB response could not be read for ${endpoint}`,
        response.status,
        { cause: caught },
      ),
    };
  }

  try {
    return {
      ok: true,
      payload: JSON.parse(text),
      totalCount: readTotalCount(response),
      status: response.status,
    };
  } catch (caught) {
    return {
      ok: false,
      response,
      error: new IgdbError(
        "upstream",
        endpoint,
        `IGDB returned a body that is not JSON for ${endpoint}`,
        response.status,
        { cause: caught },
      ),
    };
  }
}

/**
 * Performs one IGDB read and returns validated, still raw data.
 *
 * @param endpoint The IGDB endpoint, for example `games`. Used verbatim in
 * errors and logs, which is safe because it carries no credential.
 * @param body The Apicalypse body, built only by `query.ts`. It is never
 * logged or put in an error, because it can hold a visitor's search text.
 * @param schema The Zod schema for the fields the app reads. None is strict.
 * @returns The parsed response and IGDB's match count when it sent one.
 * @throws {IgdbError} Any kind; see the module comment for which and when.
 */
export async function igdbRequest<T>(
  endpoint: string,
  body: string,
  schema: z.ZodType<T>,
): Promise<IgdbResponse<T>> {
  const startedAt = Date.now();
  const deadlineAt = startedAt + IGDB_READ_DEADLINE_MS;
  const { clientId } = getIgdbCredentials();
  let refreshed = false;
  let retries = 0;

  const log = (
    event: "igdb_request_failed" | "igdb_request_retry",
    error: IgdbError,
    attemptNumber: number,
  ) =>
    logIgdb({
      event,
      endpoint,
      status: error.status,
      kind: error.kind,
      attempt: attemptNumber,
      elapsedMs: Date.now() - startedAt,
    });

  for (let attemptNumber = 1; ; attemptNumber++) {
    let token: string;
    let release: ReleaseSlot;
    try {
      token = await withinDeadline(getIgdbToken(), deadlineAt, endpoint);
      const remaining = deadlineAt - Date.now();
      try {
        release = await igdbLimiter().acquire(
          Math.max(0, Math.min(IGDB_SLOT_WAIT_MS, remaining)),
        );
      } catch (caught) {
        if (!(caught instanceof SlotWaitExceeded)) throw caught;
        // Bounded by the read's deadline rather than the slot wait, the read
        // has simply run out of time.
        throw remaining < IGDB_SLOT_WAIT_MS
          ? deadlineError(endpoint)
          : new IgdbError(
              "rate_limited",
              endpoint,
              `No IGDB request slot came free within ${IGDB_SLOT_WAIT_MS}ms for ${endpoint}`,
            );
      }
    } catch (caught) {
      // A token failure was already logged by `token.ts` as its own event.
      if (caught instanceof IgdbError && caught.endpoint === endpoint) {
        log("igdb_request_failed", caught, attemptNumber);
      }
      throw caught;
    }

    let outcome: Outcome;
    try {
      const timeoutMs = Math.max(
        1,
        Math.min(IGDB_TIMEOUT_MS, deadlineAt - Date.now()),
      );
      outcome = await attempt(endpoint, body, clientId, token, timeoutMs);
    } finally {
      release();
    }

    if (outcome.ok) {
      const parsed = schema.safeParse(outcome.payload);
      if (parsed.success) {
        return { data: parsed.data, totalCount: outcome.totalCount };
      }
      const error = new IgdbError(
        "bad_response",
        endpoint,
        `IGDB response did not match the expected shape for ${endpoint}: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`,
        outcome.status,
        { cause: parsed.error },
      );
      log("igdb_request_failed", error, attemptNumber);
      throw error;
    }

    const { error, response } = outcome;

    // A 401 most likely means the held token was revoked or expired early, so
    // it is dropped and the request repeated once with a fresh one (AC-4).
    if (error.status === 401 && !refreshed) {
      refreshed = true;
      invalidateIgdbToken(token);
      log("igdb_request_retry", error, attemptNumber);
      continue;
    }

    const canRetry = isRetryable(error.kind) && retries + 1 < IGDB_MAX_ATTEMPTS;
    if (!canRetry) {
      log("igdb_request_failed", error, attemptNumber);
      throw error;
    }

    retries++;
    const delayMs = retryDelayMs(response, retries);
    if (Date.now() + delayMs >= deadlineAt) {
      const timeout = deadlineError(endpoint);
      log("igdb_request_failed", timeout, attemptNumber);
      throw timeout;
    }
    log("igdb_request_retry", error, attemptNumber);
    await sleep(delayMs);
  }
}
