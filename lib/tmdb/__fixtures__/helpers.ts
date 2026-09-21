import { vi } from "vitest";
import { resetTmdbTokenCache } from "../env";

/**
 * Shared plumbing for the TMDB fixture tests.
 *
 * Every test here runs with no network and no real credential: `fetch` is
 * replaced and the token is a stub. That is what lets the suite run in CI,
 * where spec 0002's AC-23 requires it to pass with no TMDB token configured.
 */

export const TEST_TOKEN = "test-token";

/** One queued response for the mocked `fetch`. */
export type MockResponse = {
  status?: number;
  body?: unknown;
  /** Returned as the raw body when set, for the "not JSON at all" case. */
  text?: string;
  headers?: Record<string, string>;
  /** Rejects the attempt instead of answering it. */
  throws?: Error;
};

export type FetchMock = ReturnType<typeof installFetchMock>;

/**
 * Installs a `fetch` that answers from a queue, so a test can script a 429
 * followed by a success and then assert how many attempts were made.
 *
 * The last queued response repeats once the queue runs dry, which keeps the
 * "persistent 500" case from needing three identical entries.
 */
export function installFetchMock(responses: MockResponse[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;

  const mock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const spec = responses[Math.min(index, responses.length - 1)] ?? {};
    index++;

    if (spec.throws) throw spec.throws;

    const status = spec.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(spec.headers ?? {}),
      json: async () => {
        if (spec.text !== undefined) return JSON.parse(spec.text);
        return spec.body;
      },
    } as unknown as Response;
  });

  vi.stubEnv("TMDB_READ_ACCESS_TOKEN", TEST_TOKEN);
  resetTmdbTokenCache();
  vi.stubGlobal("fetch", mock);

  return {
    mock,
    calls,
    get attempts() {
      return calls.length;
    },
    /** The parsed URL of one attempt, for asserting query parameters. */
    url(attempt = 0) {
      return new URL(calls[attempt].url);
    },
    headers(attempt = 0) {
      return (calls[attempt].init.headers ?? {}) as Record<string, string>;
    },
  };
}

/** Undoes the globals so one test cannot decide what the next one sees. */
export function restoreFetchMock(): void {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetTmdbTokenCache();
}

/** A DOMException-shaped abort, which is what `AbortSignal.timeout` produces. */
export function timeoutError(): Error {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}
