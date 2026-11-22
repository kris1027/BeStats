import { z } from "zod";

/**
 * covers: spec 0033, AC-11; child 0036 (one refresh and one retry on a 401,
 * then a visible sign out), and the version header every call sends (AC-4)
 */
const mockGetAccessToken = jest.fn();
const mockRefresh = jest.fn();
jest.mock("./supabase", () => ({
  getAccessToken: () => mockGetAccessToken(),
  refreshAfterUnauthorized: (rejected: string) => mockRefresh(rejected),
}));
jest.mock("./env", () => ({
  getPublicEnv: () => ({ EXPO_PUBLIC_API_BASE_URL: "http://api.test" }),
}));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.0.0" } }));

const { API_TIMEOUT_MS, ApiError, apiRequest, setSessionExpiredHandler } =
  require("./api") as typeof import("./api");
const { V1_ERROR_MESSAGES, V1_NETWORK_MESSAGE } =
  require("@bestats/core/api/v1/errors") as typeof import("@bestats/core/api/v1/errors");

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const schema = z.object({ ok: z.literal(true) });
const expired = jest.fn(async () => {});

beforeEach(() => {
  fetchMock.mockReset();
  mockGetAccessToken.mockReset();
  mockRefresh.mockReset();
  expired.mockClear();
  setSessionExpiredHandler(expired);
});

test("sends the app version and the bearer token on a me call", async () => {
  mockGetAccessToken.mockResolvedValue("token-1");
  fetchMock.mockResolvedValue(respond(200, { ok: true }));
  await expect(
    apiRequest("/api/v1/me/x", schema, { auth: true }),
  ).resolves.toEqual({
    ok: true,
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://api.test/api/v1/me/x");
  expect(init.headers["X-BeStats-App-Version"]).toBe("1.0.0");
  expect(init.headers.Authorization).toBe("Bearer token-1");
});

test("retries a 401 once with the refreshed token", async () => {
  mockGetAccessToken.mockResolvedValue("old");
  mockRefresh.mockResolvedValue("new");
  fetchMock
    .mockResolvedValueOnce(respond(401, null))
    .mockResolvedValueOnce(respond(200, { ok: true }));
  await expect(
    apiRequest("/api/v1/me/x", schema, { auth: true }),
  ).resolves.toEqual({
    ok: true,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer new");
  expect(mockRefresh).toHaveBeenCalledWith("old");
  expect(expired).not.toHaveBeenCalled();
});

test("signs out without a retry when the session cannot be renewed", async () => {
  mockGetAccessToken.mockResolvedValue("old");
  mockRefresh.mockResolvedValue(null);
  fetchMock.mockResolvedValue(respond(401, null));
  await expect(
    apiRequest("/api/v1/me/x", schema, { auth: true }),
  ).rejects.toMatchObject({
    status: 401,
    message: V1_ERROR_MESSAGES.unauthenticated,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(expired).toHaveBeenCalledTimes(1);
});

test("signs out before calling when there is no session", async () => {
  mockGetAccessToken.mockResolvedValue(null);
  await expect(
    apiRequest("/api/v1/me/x", schema, { auth: true }),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(expired).toHaveBeenCalledTimes(1);
});

test("never refreshes for a public call", async () => {
  fetchMock.mockResolvedValue(
    respond(401, { error: { code: "unauthenticated", message: "x" } }),
  );
  await expect(apiRequest("/api/v1/movies/1", schema)).rejects.toMatchObject({
    status: 401,
  });
  expect(mockRefresh).not.toHaveBeenCalled();
  expect(expired).not.toHaveBeenCalled();
});

test("signs out with a visible notice after a second 401", async () => {
  mockGetAccessToken.mockResolvedValue("token");
  mockRefresh.mockResolvedValue("token-2");
  fetchMock.mockResolvedValue(respond(401, null));
  await expect(
    apiRequest("/api/v1/me/x", schema, { auth: true }),
  ).rejects.toMatchObject({
    status: 401,
    message: V1_ERROR_MESSAGES.unauthenticated,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(expired).toHaveBeenCalledTimes(1);
});

test("turns a v1 error body into an ApiError with its reason", async () => {
  mockGetAccessToken.mockResolvedValue("token");
  fetchMock.mockResolvedValue(
    respond(409, {
      error: {
        code: "not_released",
        message: "This movie hasn't been released yet.",
        reason: "not_released",
      },
    }),
  );
  const error = await apiRequest("/api/v1/me/x", schema, { auth: true }).catch(
    (caught) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 409,
    code: "not_released",
    reason: "not_released",
    message: "This movie hasn't been released yet.",
  });
});

test("says offline when the request never leaves", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(apiRequest("/api/v1/movies/1", schema)).rejects.toMatchObject({
    status: 0,
    code: "network",
    message: V1_NETWORK_MESSAGE,
  });
});

test("gives up on a request with no answer and says offline", async () => {
  jest.useFakeTimers();
  try {
    // An unreachable server: fetch never settles until its signal aborts.
    fetchMock.mockImplementation(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const settled = apiRequest("/api/v1/movies/1", schema).catch(
      (caught) => caught,
    );
    await jest.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    await expect(settled).resolves.toMatchObject({
      status: 0,
      code: "network",
      message: V1_NETWORK_MESSAGE,
    });
  } finally {
    jest.useRealTimers();
  }
});

test("gives up on an answer whose body stalls and says offline", async () => {
  jest.useFakeTimers();
  try {
    // Headers arrive, then the body never finishes until the signal aborts.
    fetchMock.mockImplementation(
      async (_url: string, init: { signal?: AbortSignal }) => ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      }),
    );
    const settled = apiRequest("/api/v1/movies/1", schema).catch(
      (caught) => caught,
    );
    await jest.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    await expect(settled).resolves.toMatchObject({
      status: 0,
      code: "network",
      message: V1_NETWORK_MESSAGE,
    });
  } finally {
    jest.useRealTimers();
  }
});

test("clears its timer once the answer is read", async () => {
  jest.useFakeTimers();
  try {
    fetchMock.mockResolvedValue(respond(200, { ok: true }));
    await expect(apiRequest("/api/v1/movies/1", schema)).resolves.toEqual({
      ok: true,
    });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
