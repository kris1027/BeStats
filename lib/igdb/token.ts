import "server-only";
import { z } from "zod";
import {
  IGDB_TOKEN_REFRESH_MARGIN_MS,
  IGDB_TOKEN_TIMEOUT_MS,
  TWITCH_TOKEN_URL,
} from "./constants";
import { getIgdbCredentials } from "./env";
import { IgdbError, type IgdbErrorKind, isAbortError } from "./errors";
import { logIgdb } from "./log";

/**
 * The Twitch app access token IGDB wants, kept in process memory (spec 0023,
 * AC-3, AC-4). This is the only file that calls Twitch.
 *
 * State moves `none → fetching → valid → fetching`: a token is reused until 10
 * minutes before it expires, or until IGDB answers 401, and every caller that
 * finds none shares one in flight request. A failed fetch returns to `none`
 * and raises, so the next caller tries again.
 *
 * The token never leaves this file except in the `Authorization` header the
 * client builds. It is never returned from a cached scope, put in a URL, logged
 * or written into an error message.
 */

const ENDPOINT = "token";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

type Memo = { accessToken: string; refreshAt: number };

let memo: Memo | null = null;
let inflight: Promise<string> | null = null;

function kindForTokenStatus(status: number): IgdbErrorKind {
  if (status === 400 || status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  return "upstream";
}

async function fetchToken(): Promise<string> {
  const { clientId, clientSecret } = getIgdbCredentials();
  const startedAt = Date.now();

  const fail = (
    kind: IgdbErrorKind,
    message: string,
    status: number | null,
    cause?: unknown,
  ): never => {
    logIgdb({
      event: "igdb_token_failed",
      endpoint: ENDPOINT,
      status,
      kind,
      attempt: 1,
      elapsedMs: Date.now() - startedAt,
    });
    throw new IgdbError(kind, ENDPOINT, message, status, { cause });
  };

  let response: Response;
  try {
    // The secret travels in a form body, never in the URL (AC-3).
    response = await fetch(TWITCH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }).toString(),
      signal: AbortSignal.timeout(IGDB_TOKEN_TIMEOUT_MS),
    });
  } catch (caught) {
    return isAbortError(caught)
      ? fail(
          "timeout",
          `Twitch did not issue a token within ${IGDB_TOKEN_TIMEOUT_MS}ms`,
          null,
          caught,
        )
      : fail("upstream", "The Twitch token request failed", null, caught);
  }

  if (!response.ok) {
    return fail(
      kindForTokenStatus(response.status),
      `Twitch refused the token request with ${response.status}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await response.text());
  } catch (caught) {
    return fail(
      "upstream",
      "Twitch sent a token response that is not JSON",
      response.status,
      caught,
    );
  }

  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    // The issues name fields only, never values, but they are left out anyway
    // because the payload is the one place the token lives.
    return fail(
      "upstream",
      "Twitch sent a token response without a usable token",
      response.status,
    );
  }

  memo = {
    accessToken: parsed.data.access_token,
    refreshAt:
      startedAt + parsed.data.expires_in * 1000 - IGDB_TOKEN_REFRESH_MARGIN_MS,
  };
  return memo.accessToken;
}

/**
 * Returns a valid token, fetching one when none is held.
 *
 * Concurrent callers share one request. The shared promise is cleared in
 * `finally`, so a failed or hung Twitch call never blocks the next caller.
 *
 * @throws {IgdbError} `unauthorized`, `rate_limited`, `timeout` or `upstream`.
 */
export function getIgdbToken(): Promise<string> {
  if (memo !== null && Date.now() < memo.refreshAt) {
    return Promise.resolve(memo.accessToken);
  }
  memo = null;
  if (inflight === null) {
    inflight = fetchToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Drops the held token after IGDB answered 401 with it (AC-4).
 *
 * Only the token that failed is dropped: when several requests fail with the
 * same old token, the first one's refresh must not be thrown away by the rest.
 *
 * @param failedToken The token the rejected request carried.
 */
export function invalidateIgdbToken(failedToken: string): void {
  if (memo?.accessToken === failedToken) memo = null;
}

/** Forgets every token state, for the tests. */
export function resetIgdbTokenState(): void {
  memo = null;
  inflight = null;
}
