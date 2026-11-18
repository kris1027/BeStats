import { v1ErrorBodySchema } from "@bestats/core/api/v1/errors";
import { APP_VERSION_HEADER } from "@bestats/core/api/v1/version";
import Constants from "expo-constants";
import type { z } from "zod";

import { getPublicEnv } from "./env";
import { getAccessToken } from "./supabase";

/** What the app shows when a request never reached the server. */
export const OFFLINE_MESSAGE =
  "You're offline. Check your connection and try again.";

/** The notice a second 401 signs the user out with (spec 0033, child 0036). */
export const SESSION_EXPIRED_MESSAGE = "Your session expired, sign in again.";

/**
 * A refused or failed API call, carrying the v1 error code and, for a
 * tracking write, the Server Action's own `reason` (spec 0033, AC-5). The
 * message is always English copy the server or this app wrote, never a raw
 * upstream error (AGENTS.md section 11).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
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
 * `SESSION_EXPIRED_MESSAGE`, so a failure is never silent.
 */
export function setSessionExpiredHandler(handler: () => Promise<void>): void {
  onSessionExpired = handler;
}

/** The user facing app version the API checks (`X-BeStats-App-Version`). */
export function appVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

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
 * for the session once more (the library refreshes it if it can) and retries
 * exactly once; a second 401 signs out with a visible notice (child 0036).
 *
 * @throws ApiError for every refusal, an unreadable answer, or no network.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && options.auth) {
    response = await send(path, options);
    if (response.status === 401) {
      await onSessionExpired();
      throw new ApiError(401, "unauthenticated", SESSION_EXPIRED_MESSAGE);
    }
  }

  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const parsed = schema.safeParse(body);
    if (parsed.success) return parsed.data;
    throw new ApiError(response.status, "internal", "Something went wrong.");
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
  throw new ApiError(response.status, "internal", "Something went wrong.");
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    [APP_VERSION_HEADER]: appVersion(),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth) {
    const token = await getAccessToken();
    if (!token) {
      await onSessionExpired();
      throw new ApiError(401, "unauthenticated", SESSION_EXPIRED_MESSAGE);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    return await fetch(`${getPublicEnv().EXPO_PUBLIC_API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "network", OFFLINE_MESSAGE);
  }
}
