/**
 * covers: spec 0033, AC-5 (game writes run the server's command, which
 * holds the release gate), AC-7 (Undo of a removal or a cleared score), and
 * AGENTS.md "Games" (a status and a score are separate requests).
 */
const mockApiRequest = jest.fn();
jest.mock("./api", () => ({
  ApiError: class ApiError extends Error {},
  appVersion: () => "1.0.0",
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const {
  putGameRating,
  putGameStatus,
  removeGame,
  restoreGame,
  writeGameIntent,
} = require("./games") as typeof import("./games");
const { v1GameWriteOkSchema } =
  require("@bestats/core/api/v1/game") as typeof import("@bestats/core/api/v1/game");

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({ ok: true });
});

function lastCall() {
  const [path, schema, options] = mockApiRequest.mock.calls.at(-1) ?? [];
  return { path, schema, options };
}

describe("game writes", () => {
  test("a status sends PUT with only the status", async () => {
    await putGameStatus(1942, "playing");
    expect(lastCall()).toEqual({
      path: "/api/v1/me/games/1942",
      schema: v1GameWriteOkSchema,
      options: { method: "PUT", body: { status: "playing" }, auth: true },
    });
  });

  test("a score sends PUT with only the rating", async () => {
    await putGameRating(1942, 9);
    expect(lastCall().options?.body).toEqual({ rating: 9 });
  });

  test("removing a game sends DELETE with no body", async () => {
    await removeGame(1942);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/games/1942",
      schema: v1GameWriteOkSchema,
      options: { method: "DELETE", auth: true },
    });
  });
});

describe("writeGameIntent", () => {
  test("a null status removes the game rather than sending status null", async () => {
    await writeGameIntent(7, { kind: "status", value: null });
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(lastCall().options).toEqual({ method: "DELETE", auth: true });
  });

  test.each(["want_to_play", "playing", "finished"] as const)(
    "status %s goes to PUT with that status",
    async (status) => {
      await writeGameIntent(7, { kind: "status", value: status });
      expect(lastCall().options).toEqual({
        method: "PUT",
        body: { status },
        auth: true,
      });
    },
  );

  test("a cleared score sends rating null, never a removal", async () => {
    await writeGameIntent(7, { kind: "rating", value: null });
    expect(lastCall().options).toEqual({
      method: "PUT",
      body: { rating: null },
      auth: true,
    });
  });

  test("a score intent never also sends a status", async () => {
    await writeGameIntent(7, { kind: "rating", value: 6 });
    expect(lastCall().options?.body).not.toHaveProperty("status");
  });
});

describe("restoreGame", () => {
  test("posts the removal Undo with its removedAt to the game's restore route", async () => {
    const cleared = {
      kind: "game_removed",
      gameId: 1942,
      previous: { status: "finished", rating: 9 },
      removedAt: "2026-11-21T10:00:00+00:00",
    } as const;
    await restoreGame(cleared as never);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/games/1942/restore",
      schema: v1GameWriteOkSchema,
      options: { method: "POST", body: { cleared }, auth: true },
    });
  });

  test("posts a cleared score Undo to the same route", async () => {
    const cleared = {
      kind: "game_status",
      gameId: 1942,
      previous: { status: "finished", rating: 9 },
    } as const;
    await restoreGame(cleared as never);
    expect(lastCall().path).toBe("/api/v1/me/games/1942/restore");
    expect(lastCall().options?.body).toEqual({ cleared });
  });
});
