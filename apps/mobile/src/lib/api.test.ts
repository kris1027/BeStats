import { z } from "zod";

/**
 * covers: spec 0033, AC-11; child 0036 (one retry on a 401, then a visible
 * sign out), and the version header every call sends (AC-4)
 */
const mockGetAccessToken = jest.fn();
jest.mock("./supabase", () => ({ getAccessToken: () => mockGetAccessToken() }));
jest.mock("./env", () => ({
  getPublicEnv: () => ({ EXPO_PUBLIC_API_BASE_URL: "http://api.test" }),
}));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.0.0" } }));

const {
  ApiError,
  apiRequest,
  setSessionExpiredHandler,
  SESSION_EXPIRED_MESSAGE,
} = require("./api") as typeof import("./api");

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

test("retries a 401 once with the session's new token", async () => {
  mockGetAccessToken.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
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
  expect(expired).not.toHaveBeenCalled();
});

test("signs out with a visible notice after a second 401", async () => {
  mockGetAccessToken.mockResolvedValue("token");
  fetchMock.mockResolvedValue(respond(401, null));
  await expect(
    apiRequest("/api/v1/me/x", schema, { auth: true }),
  ).rejects.toMatchObject({
    status: 401,
    message: SESSION_EXPIRED_MESSAGE,
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
  });
});
