import { vi } from "vitest";
import { resetIgdbCredentialsCache } from "../env";
import { resetIgdbLimiter } from "../limiter";
import { resetIgdbTokenState } from "../token";

/**
 * Shared plumbing for the IGDB fixture tests (spec 0023, AC-19).
 *
 * Every test runs with no network and no real credential: `fetch` answers
 * from two queues, one for Twitch's token endpoint and one for IGDB, and the
 * credentials are stubs. That lets the suite pass in CI, where no Twitch
 * application exists.
 */

export const TEST_CLIENT_ID = "test-client-id";
export const TEST_CLIENT_SECRET = "test-client-secret";
export const TEST_TOKEN = "test-token";

export type MockResponse = {
  status?: number;
  body?: unknown;
  /** Returned as the raw body when set, for the "not JSON" case. */
  text?: string;
  headers?: Record<string, string>;
  /** Rejects the attempt instead of answering it. */
  throws?: Error;
  /** Never answers until the request's signal aborts. */
  hangs?: boolean;
};

type Call = { url: string; init: RequestInit };

/**
 * A Twitch token answer. The default expiry is far off, so a test only meets
 * a refresh when it asks for one.
 */
export function tokenResponse(
  accessToken = TEST_TOKEN,
  expiresIn = 5_000_000,
): MockResponse {
  return { body: { access_token: accessToken, expires_in: expiresIn } };
}

function answer(spec: MockResponse, init: RequestInit): Promise<Response> {
  if (spec.throws) return Promise.reject(spec.throws);
  if (spec.hangs) {
    return new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason ?? timeoutError()),
      );
    });
  }
  const status = spec.status ?? 200;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(spec.headers ?? {}),
    text: async () => spec.text ?? JSON.stringify(spec.body ?? []),
  } as unknown as Response);
}

/**
 * Installs the mocked `fetch`. Each queue's last entry repeats once it runs
 * dry, so "three 503s" needs one entry.
 */
export function installIgdbMock({
  igdb = [{ body: [] }],
  token = [tokenResponse()],
}: {
  igdb?: MockResponse[];
  token?: MockResponse[];
} = {}) {
  const igdbCalls: Call[] = [];
  const tokenCalls: Call[] = [];

  const mock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const target = String(url);
    const isToken = target.startsWith("https://id.twitch.tv/");
    const calls = isToken ? tokenCalls : igdbCalls;
    const queue = isToken ? token : igdb;
    calls.push({ url: target, init });
    return answer(queue[Math.min(calls.length - 1, queue.length - 1)], init);
  });

  vi.stubEnv("IGDB_CLIENT_ID", TEST_CLIENT_ID);
  vi.stubEnv("IGDB_CLIENT_SECRET", TEST_CLIENT_SECRET);
  resetModuleState();
  vi.stubGlobal("fetch", mock);

  return {
    mock,
    igdbCalls,
    tokenCalls,
    /** The Apicalypse body of one IGDB attempt. */
    body(attempt = 0): string {
      return String(igdbCalls[attempt].init.body);
    },
    headers(attempt = 0): Record<string, string> {
      return (igdbCalls[attempt].init.headers ?? {}) as Record<string, string>;
    },
  };
}

export type IgdbMock = ReturnType<typeof installIgdbMock>;

function resetModuleState(): void {
  resetIgdbCredentialsCache();
  resetIgdbTokenState();
  resetIgdbLimiter();
}

/** Undoes the globals and the module memory, so no test decides the next. */
export function restoreIgdbMock(): void {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetModuleState();
}

/** What `AbortSignal.timeout` rejects with. */
export function timeoutError(): Error {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}

/**
 * Settles a promise while fake timers run, and returns how it settled, so a
 * test never leaves an unhandled rejection behind.
 */
export async function settle<T>(
  promise: Promise<T>,
): Promise<{ value?: T; error?: unknown }> {
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return outcome;
}

/**
 * Makes `AbortSignal.timeout` run on Vitest's fake timers, which do not patch
 * it, and records each requested duration.
 */
export function fakeAbortTimeouts(): number[] {
  const durations: number[] = [];
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    durations.push(ms);
    const controller = new AbortController();
    setTimeout(() => controller.abort(timeoutError()), ms);
    return controller.signal;
  });
  return durations;
}
