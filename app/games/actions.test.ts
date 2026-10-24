import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0026, AC-3 to AC-6, AC-8 to AC-10, AC-15
 *
 * The session, IGDB and the database are the boundaries, so those are the
 * three things replaced, as in `app/movies/actions.test.ts`. The fake client
 * records every call, so each test asserts what would reach PostgREST, and
 * that nothing is written on a refusal.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const readGame = vi.fn();
vi.mock("./[id]/load-game", () => ({ readGame }));

const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh }));

const calls: { method: string; args: unknown[] }[] = [];
let result: { data: unknown; error: unknown } = { data: null, error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "update", "eq", "not", "rpc"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return chain;
}

const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
  rpc: (...args: unknown[]) =>
    (builder().rpc as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const {
  removeGame,
  restoreGameStatus,
  restoreRemovedGame,
  setGameRating,
  setGameStatus,
} = await import("./actions");

const USER = { id: "user-a", email: "a@example.test" };
const GAME = 1942;
const writes = () => calls.filter((call) => call.method !== "eq");

const PREVIOUS = {
  status: "finished",
  rating: 9,
  addedAt: "2026-09-01T10:00:00+00:00",
  startedAt: null,
  finishedAt: "2026-09-20T10:00:00+00:00",
} as const;

function released(overrides: Record<string, unknown> = {}) {
  return {
    kind: "found",
    game: { id: GAME, releaseDate: "2015-05-19", hidden: false, ...overrides },
  };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getOptionalUser.mockResolvedValue(USER);
  readGame.mockResolvedValue(released());
  result = { data: null, error: null };
  calls.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("setGameStatus", () => {
  const NO_ROW = {
    prev_status: null,
    prev_rating: null,
    prev_added_at: null,
    prev_started_at: null,
    prev_finished_at: null,
  };

  it("sets a status through set_game_status, then refreshes (AC-3, AC-10)", async () => {
    result = { data: [NO_ROW], error: null };
    expect(await setGameStatus(GAME, "playing")).toEqual({ ok: true });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: ["set_game_status", { p_game_id: GAME, p_status: "playing" }],
      },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("returns the status Undo when a move to Want to play cleared a score (AC-5)", async () => {
    result = {
      data: [
        {
          prev_status: "finished",
          prev_rating: 9,
          prev_added_at: PREVIOUS.addedAt,
          prev_started_at: null,
          prev_finished_at: PREVIOUS.finishedAt,
        },
      ],
      error: null,
    };
    expect(await setGameStatus(GAME, "want_to_play")).toEqual({
      ok: true,
      undo: { kind: "status", previous: PREVIOUS },
    });
  });

  it("offers no Undo when no score was cleared (AC-5)", async () => {
    result = {
      data: [
        {
          prev_status: "playing",
          prev_rating: null,
          prev_added_at: PREVIOUS.addedAt,
          prev_started_at: PREVIOUS.addedAt,
          prev_finished_at: null,
        },
      ],
      error: null,
    };
    expect(await setGameStatus(GAME, "want_to_play")).toEqual({ ok: true });
  });

  it("offers no Undo on a move between Playing and Finished (AC-6)", async () => {
    result = {
      data: [{ ...NO_ROW, prev_status: "playing", prev_rating: 8 }],
      error: null,
    };
    expect(await setGameStatus(GAME, "finished")).toEqual({ ok: true });
  });

  it.each([
    ["a future date", "2999-01-01"],
    ["no date", null],
  ])(
    "refuses Playing and Finished before release, with %s (AC-9)",
    async (_, releaseDate) => {
      readGame.mockResolvedValue(released({ releaseDate }));
      for (const status of ["playing", "finished"] as const) {
        expect(await setGameStatus(GAME, status)).toEqual({
          ok: false,
          error: "not_released",
        });
      }
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  it("accepts Want to play before release (AC-8)", async () => {
    readGame.mockResolvedValue(released({ releaseDate: null }));
    result = { data: [NO_ROW], error: null };
    expect(await setGameStatus(GAME, "want_to_play")).toEqual({ ok: true });
  });

  it("refuses a hidden game on Playing and Finished, but accepts Want to play (AC-9)", async () => {
    readGame.mockResolvedValue(released({ hidden: true }));
    expect(await setGameStatus(GAME, "playing")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await setGameStatus(GAME, "finished")).toEqual({
      ok: false,
      error: "not_found",
    });
    result = { data: [NO_ROW], error: null };
    expect(await setGameStatus(GAME, "want_to_play")).toEqual({ ok: true });
  });

  it("refuses an id IGDB does not know (AC-9)", async () => {
    readGame.mockResolvedValue({ kind: "not_found" });
    expect(await setGameStatus(GAME, "want_to_play")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("refuses with igdb_unavailable when IGDB fails, Want to play too (AC-9)", async () => {
    readGame.mockResolvedValue({ kind: "failed" });
    expect(await setGameStatus(GAME, "want_to_play")).toEqual({
      ok: false,
      error: "igdb_unavailable",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses a status outside the three as invalid_input (AC-10)", async () => {
    expect(
      await setGameStatus(GAME, "dropped" as unknown as "playing"),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it("logs a refusal with its event and outcome only (AC-15)", async () => {
    readGame.mockResolvedValue(released({ releaseDate: null }));
    await setGameStatus(GAME, "playing");
    expect(warn).toHaveBeenCalledWith(
      "game_tracking.status refused not_released",
    );
  });
});

describe("setGameRating", () => {
  it("scores through rate_game (AC-6)", async () => {
    expect(await setGameRating(GAME, 8)).toEqual({ ok: true });
    expect(writes()).toEqual([
      { method: "rpc", args: ["rate_game", { p_game_id: GAME, p_rating: 8 }] },
    ]);
  });

  it("clears with a plain update that never calls IGDB (AC-6, AC-9)", async () => {
    readGame.mockResolvedValue({ kind: "failed" });
    expect(await setGameRating(GAME, null)).toEqual({ ok: true });
    expect(writes()).toEqual([
      { method: "from", args: ["user_game_state"] },
      { method: "update", args: [{ rating: null }] },
      // Only a scored row, so an unscored one keeps its Undo window.
      { method: "not", args: ["rating", "is", null] },
    ]);
    expect(readGame).not.toHaveBeenCalled();
  });

  it("refuses a score before release (AC-9)", async () => {
    readGame.mockResolvedValue(released({ releaseDate: "2999-01-01" }));
    expect(await setGameRating(GAME, 8)).toEqual({
      ok: false,
      error: "not_released",
    });
  });

  it("maps BS004 to not_started (AC-6, AC-15)", async () => {
    result = { data: null, error: { code: "BS004" } };
    expect(await setGameRating(GAME, 8)).toEqual({
      ok: false,
      error: "not_started",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("maps BS003 to write_failed, logged as identity_locked (AC-15)", async () => {
    result = { data: null, error: { code: "BS003" } };
    expect(await setGameRating(GAME, 8)).toEqual({
      ok: false,
      error: "write_failed",
    });
    expect(warn).toHaveBeenCalledWith(
      "game_tracking.rate refused identity_locked",
    );
  });

  it("refuses a score of 11 as invalid_input", async () => {
    expect(await setGameRating(GAME, 11)).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });
});

describe("removeGame", () => {
  it("returns the removal Undo when a row came back, with no IGDB call (AC-4, AC-9)", async () => {
    readGame.mockResolvedValue({ kind: "failed" });
    result = {
      data: [
        {
          removed_status: "finished",
          removed_rating: 9,
          removed_added_at: PREVIOUS.addedAt,
          removed_started_at: null,
          removed_finished_at: PREVIOUS.finishedAt,
          removed_at: "2026-10-24T10:00:00+00:00",
        },
      ],
      error: null,
    };
    expect(await removeGame(GAME)).toEqual({
      ok: true,
      undo: {
        kind: "removed",
        previous: PREVIOUS,
        removedAt: "2026-10-24T10:00:00+00:00",
      },
    });
    expect(readGame).not.toHaveBeenCalled();
  });

  it("is a quiet success with no Undo when the row was already gone (AC-4)", async () => {
    result = { data: [], error: null };
    expect(await removeGame(GAME)).toEqual({ ok: true });
  });
});

describe("the restores", () => {
  it("restores a status with the old values and no IGDB call (AC-5, AC-9)", async () => {
    readGame.mockResolvedValue({ kind: "failed" });
    expect(await restoreGameStatus(GAME, PREVIOUS)).toEqual({ ok: true });
    expect(writes()).toEqual([
      {
        method: "rpc",
        args: [
          "restore_game_status",
          {
            p_game_id: GAME,
            p_status: "finished",
            p_added_at: PREVIOUS.addedAt,
            p_rating: 9,
            p_started_at: undefined,
            p_finished_at: PREVIOUS.finishedAt,
          },
        ],
      },
    ]);
    expect(readGame).not.toHaveBeenCalled();
  });

  it("restores a removal with its time of removal (AC-4)", async () => {
    expect(
      await restoreRemovedGame(GAME, PREVIOUS, "2026-10-24T10:00:00+00:00"),
    ).toEqual({ ok: true });
    expect(writes()[0]).toMatchObject({
      method: "rpc",
      args: [
        "restore_removed_game",
        { p_game_id: GAME, p_removed_at: "2026-10-24T10:00:00+00:00" },
      ],
    });
  });

  it("maps P0002 to undo_expired (AC-14)", async () => {
    result = { data: null, error: { code: "P0002" } };
    expect(await restoreGameStatus(GAME, PREVIOUS)).toEqual({
      ok: false,
      error: "undo_expired",
    });
  });

  it.each([
    ["Playing with no start", { status: "playing", startedAt: null }],
    ["Finished with no finish", { status: "finished", finishedAt: null }],
    ["Want to play with a score", { status: "want_to_play", rating: 7 }],
  ])(
    "refuses %s as invalid_input before any call (AC-14)",
    async (_, change) => {
      expect(
        await restoreGameStatus(GAME, {
          ...PREVIOUS,
          ...change,
        } as typeof PREVIOUS),
      ).toEqual({ ok: false, error: "invalid_input" });
      expect(getOptionalUser).not.toHaveBeenCalled();
    },
  );
});
