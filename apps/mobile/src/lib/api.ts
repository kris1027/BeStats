import {
  V1_ERROR_MESSAGES,
  V1_NETWORK_MESSAGE,
  type V1ErrorCode,
  v1ErrorBodySchema,
} from "@bestats/core/api/v1/errors";
import { APP_VERSION_HEADER } from "@bestats/core/api/v1/version";
import Constants from "expo-constants";
import type { z } from "zod";

import { getPublicEnv } from "./env";
import { getAccessToken, refreshAfterUnauthorized } from "./supabase";

/** A v1 error code, or `network` when no answer arrived at all. */
export type ApiErrorCode = V1ErrorCode | "network";

/**
 * A refused or failed API call, carrying the v1 error code and, for a
 * tracking write, the Server Action's own `reason` (spec 0033, AC-5). The
 * message is always English copy the server or this app wrote, never a raw
 * upstream error (AGENTS.md section 11).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onSessionExpired: () => Promise<void> = async () => {};

/**
 * Registers what happens when a `me` call is refused twice: the session
 * provider signs out locally, wipes the query cache and shows
 * the core `unauthenticated` copy, so a failure is never silent.
 */
export function setSessionExpiredHandler(handler: () => Promise<void>): void {
  onSessionExpired = handler;
}

/**
 * The user facing app version the API checks (`X-BeStats-App-Version`). The
 * app reaches the catalog and its state only through `/api/v1`, which refuses
 * an app too old for its contract (AGENTS.md section 5).
 */
export function appVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/**
 * How long one request may wait for its whole answer, headers and body,
 * before it fails as `network` (root AGENTS.md section 11: a failure shows
 * visibly). Without it an
 * unreachable API waits for the system's own timeout, about a minute on iOS,
 * twice over with the query's one retry, behind a spinner.
 */
export const API_TIMEOUT_MS = 15_000;

type RequestOptions = {
  method?: "GET" | "PUT" | "POST" | "DELETE";
  body?: unknown;
  /** True for `/api/v1/me/*`: sends the access token and handles a 401. */
  auth?: boolean;
};

/**
 * Calls `/api/v1` and parses the answer with its core schema, so the app and
 * the API cannot drift (spec 0033, child 0035).
 *
 * For a `me` call it takes the token from `getAccessToken()`. On a 401 it asks
 * `refreshAfterUnauthorized` for a token other than the refused one (one
 * shared refresh, however many calls failed together) and retries exactly
 * once; no new token, or a second 401, signs out with a visible notice
 * (child 0036; AGENTS.md section 11).
 *
 * @throws ApiError for every refusal, an unreadable answer, or no network.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  let token = options.auth ? await getAccessToken() : null;
  if (options.auth && !token) return sessionExpired();
  let response = await send(path, options, token);
  if (response.status === 401 && token) {
    token = await refreshAfterUnauthorized(token);
    if (!token) return sessionExpired();
    response = await send(path, options, token);
    if (response.status === 401) return sessionExpired();
  }

  const { body } = response;
  if (response.ok) {
    const parsed = schema.safeParse(body);
    if (parsed.success) return parsed.data;
    throw unreadable(response.status);
  }

  const error = v1ErrorBodySchema.safeParse(body);
  if (error.success) {
    throw new ApiError(
      response.status,
      error.data.error.code,
      error.data.error.message,
      error.data.error.reason,
    );
  }
  throw unreadable(response.status);
}

async function sessionExpired(): Promise<never> {
  await onSessionExpired();
  throw new ApiError(401, "unauthenticated", V1_ERROR_MESSAGES.unauthenticated);
}

function unreadable(status: number): ApiError {
  return new ApiError(status, "internal", V1_ERROR_MESSAGES.internal);
}

/** One answer, its body already read (`null` when it is not JSON). */
type Answer = { status: number; ok: boolean; body: unknown };

async function send(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Answer> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    [APP_VERSION_HEADER]: appVersion(),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  // One timer spans the headers and the body, so an answer that stalls
  // halfway fails as `network` too rather than spinning on.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${getPublicEnv().EXPO_PUBLIC_API_BASE_URL}${path}`,
      {
        method: options.method ?? "GET",
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      },
    );
    const body: unknown = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    return { status: response.status, ok: response.ok, body };
  } catch {
    throw new ApiError(0, "network", V1_NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}
