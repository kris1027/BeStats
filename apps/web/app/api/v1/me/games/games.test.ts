import { v1GameSchema, v1GameWriteOkSchema } from "@bestats/core/api/v1/game";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import gameFixture from "@/lib/igdb/__fixtures__/game-1942.json";
import { normalizeGame } from "@/lib/igdb/normalize";

import {
  AUTH,
  calls,
  ctx,
  errorOf,
  fakeClient,
  req,
  resetDb,
  setDbResult,
  VERSION,
} from "../../test-kit";

/**
 * covers: spec 0033, AC-5, AC-6 (games), AC-7, AC-8 for the game routes.
 * IGDB and Supabase are the boundaries; each write runs the real shared
 * command, and every success body parses with its core schema (spec 0035,
 * Key invariants).
 */
const loadGame = vi.fn();
const readGameIncludingHidden = vi.fn();
vi.mock("@/lib/igdb/load-game", () => ({ loadGame, readGameIncludingHidden }));
const verifyBearer = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyBearer }));

const { GET: getGame } = await import("../../games/[id]/route");
const { PUT: putGame, DELETE: deleteGame } = await import("./[id]/route");
const { POST: restoreGame } = await import("./[id]/restore/route");

const GAME = normalizeGame(gameFixture[0] as never);
const FOUND = { kind: "found", game: GAME };
const UNRELEASED = {
  kind: "found",
  game: { ...GAME, releaseDate: "2026-11-19" },
};
const PREVIOUS = {
  status: "finished",
  rating: 9,
  addedAt: "2026-09-01T10:00:00+00:00",
  startedAt: "2026-09-02T10:00:00+00:00",
  finishedAt: "2026-09-20T10:00:00+00:00",
} as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  resetDb();
  verifyBearer.mockResolvedValue({ userId: "user-a", client: fakeClient() });
  loadGame.mockResolvedValue(FOUND);
  readGameIncludingHidden.mockResolvedValue(FOUND);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const writes = () => calls.filter((call) => call.method !== "eq");

function put(body: unknown, id = "1942") {
  return putGame(
    req(`/api/v1/me/games/${id}`, AUTH, { method: "PUT", body }),
    ctx({ id }),
  );
}

function restore(cleared: unknown, id = "1942") {
  return restoreGame(
    req(`/api/v1/me/games/${id}/restore`, AUTH, {
      method: "POST",
      body: { cleared },
    }),
    ctx({ id }),
  );
}

describe("GET /api/v1/games/{id}", () => {
  it("answers the game with a public cache and no hidden flag", async () => {
    const response = await getGame(
      req("/api/v1/games/1942", VERSION),
      ctx({ id: "1942" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    const body = await response.json();
    expect(body).not.toHaveProperty("hidden");
    const game = v1GameSchema.parse(body);
    expect(game.id).toBe(1942);
    expect(game.releaseDate).toBe(GAME.releaseDate);
  });

  it("answers 404 for a hidden or unknown game and 502 when IGDB fails, never cached", async () => {
    loadGame.mockResolvedValueOnce({ kind: "not_found" });
    const missing = await getGame(
      req("/api/v1/games/9", VERSION),
      ctx({ id: "9" }),
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("no-store");

    loadGame.mockResolvedValueOnce({ kind: "failed" });
    const failed = await getGame(
      req("/api/v1/games/9", VERSION),
      ctx({ id: "9" }),
    );
    expect(failed.status).toBe(502);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 400 for an id outside the bounds", async () => {
    const response = await getGame(
      req("/api/v1/games/0", VERSION),
      ctx({ id: "0" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("PUT /api/v1/me/games/{id}", () => {
  it("sets Playing on a released game, private and uncached", async () => {
    const response = await put({ status: "playing" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(v1GameWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
    });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: ["set_game_status", { p_game_id: 1942, p_status: "playing" }],
      },
    ]);
  });

  it("returns the status Undo when Want to play cleared a score", async () => {
    setDbResult({
      data: [
        {
          prev_status: "finished",
          prev_rating: 9,
          prev_added_at: PREVIOUS.addedAt,
          prev_started_at: PREVIOUS.startedAt,
          prev_finished_at: PREVIOUS.finishedAt,
        },
      ],
      error: null,
    });
    const response = await put({ status: "want_to_play" });
    expect(v1GameWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
      undo: { kind: "status", previous: PREVIOUS },
    });
  });

  it("answers 409 not_released for Playing, Finished or a score before release, writing nothing", async () => {
    readGameIncludingHidden.mockResolvedValue(UNRELEASED);
    for (const body of [
      { status: "playing" },
      { status: "finished" },
      { rating: 8 },
    ]) {
      const response = await put(body);
      expect(response.status).toBe(409);
      const error = await errorOf(response);
      expect(error.code).toBe("not_released");
      expect(error.reason).toBe("not_released");
    }
    expect(calls).toEqual([]);
  });

  it("accepts Want to play and clears a score before release, never gated", async () => {
    readGameIncludingHidden.mockResolvedValue(UNRELEASED);
    expect((await put({ status: "want_to_play" })).status).toBe(200);
    const cleared = await put({ rating: null });
    expect(cleared.status).toBe(200);
    expect(writes()).toContainEqual({
      method: "update",
      args: [{ rating: null }],
    });
  });

  it("scores through rate_game, and answers 409 conflict on a game not started", async () => {
    expect((await put({ rating: 8 })).status).toBe(200);
    expect(writes()).toContainEqual({
      method: "rpc",
      args: ["rate_game", { p_game_id: 1942, p_rating: 8 }],
    });

    setDbResult({ data: null, error: { code: "BS004" } });
    const refused = await put({ rating: 8 });
    expect(refused.status).toBe(409);
    expect((await errorOf(refused)).reason).toBe("not_started");
  });

  it("answers 400 for a body with both a status and a score, or neither", async () => {
    for (const body of [{ status: "playing", rating: 7 }, {}]) {
      const response = await put(body);
      expect(response.status).toBe(400);
    }
    expect(calls).toEqual([]);
    expect(readGameIncludingHidden).not.toHaveBeenCalled();
  });

  it("answers 404 for a game IGDB does not know and 502 when IGDB fails", async () => {
    readGameIncludingHidden.mockResolvedValueOnce({ kind: "not_found" });
    expect((await put({ status: "want_to_play" })).status).toBe(404);
    readGameIncludingHidden.mockResolvedValueOnce({ kind: "failed" });
    expect((await put({ status: "want_to_play" })).status).toBe(502);
  });

  it("answers 401 with no write when the token fails", async () => {
    verifyBearer.mockResolvedValueOnce(null);
    const response = await put({ status: "playing" });
    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe("DELETE /api/v1/me/games/{id}", () => {
  it("removes with no IGDB read and returns the removed Undo", async () => {
    setDbResult({
      data: [
        {
          removed_status: "finished",
          removed_rating: 9,
          removed_added_at: PREVIOUS.addedAt,
          removed_started_at: PREVIOUS.startedAt,
          removed_finished_at: PREVIOUS.finishedAt,
          removed_at: "2026-11-18T11:59:00+00:00",
        },
      ],
      error: null,
    });
    const response = await deleteGame(
      req("/api/v1/me/games/1942", AUTH, { method: "DELETE" }),
      ctx({ id: "1942" }),
    );
    expect(response.status).toBe(200);
    expect(v1GameWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
      undo: {
        kind: "removed",
        previous: PREVIOUS,
        removedAt: "2026-11-18T11:59:00+00:00",
      },
    });
    expect(readGameIncludingHidden).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/me/games/{id}/restore", () => {
  it("restores a status Undo with no IGDB read", async () => {
    const response = await restore({
      kind: "game_status",
      gameId: 1942,
      previous: PREVIOUS,
    });
    expect(response.status).toBe(200);
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "restore_game_status",
          {
            p_game_id: 1942,
            p_status: "finished",
            p_added_at: PREVIOUS.addedAt,
            p_rating: 9,
            p_started_at: PREVIOUS.startedAt,
            p_finished_at: PREVIOUS.finishedAt,
          },
        ],
      },
    ]);
    expect(readGameIncludingHidden).not.toHaveBeenCalled();
  });

  it("restores a removal with its time of removal", async () => {
    const response = await restore({
      kind: "game_removed",
      gameId: 1942,
      previous: PREVIOUS,
      removedAt: "2026-11-18T11:59:00+00:00",
    });
    expect(response.status).toBe(200);
    expect(writes()[0]?.args[0]).toBe("restore_removed_game");
  });

  it("refuses another kind or another game with 400, writing nothing", async () => {
    const otherKind = await restore({ kind: "movie_watchlist", movieId: 1942 });
    expect(otherKind.status).toBe(400);
    const otherGame = await restore({
      kind: "game_status",
      gameId: 7346,
      previous: PREVIOUS,
    });
    expect(otherGame.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("answers 409 conflict when the Undo window has passed", async () => {
    setDbResult({ data: null, error: { code: "P0002" } });
    const response = await restore({
      kind: "game_status",
      gameId: 1942,
      previous: PREVIOUS,
    });
    expect(response.status).toBe(409);
    expect((await errorOf(response)).reason).toBe("undo_expired");
  });
});
