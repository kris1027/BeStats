import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0026, AC-1, AC-12
 *
 * The read behind the game page's tracking slot. The session and the database
 * are the boundaries, so those are what is replaced; the query builder
 * records what it was asked, as in `movie-state.test.ts`.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const calls: { method: string; args: unknown[] }[] = [];
let response: { data: unknown; error: unknown } = { data: null, error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(response);
  return chain;
}

// The client itself must not be thenable, or awaiting `createClient()` would
// resolve straight to the query result.
const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { getGameTracking } = await import("./game-state");

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  getOptionalUser.mockResolvedValue({ id: "user-a", email: "a@example.test" });
  response = { data: null, error: null };
  calls.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("getGameTracking", () => {
  it("is signed out, with no session read, when the public env is missing (AC-1)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    expect(await getGameTracking(1942)).toEqual({ kind: "signed_out" });
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it("is signed out, with no query, for a visitor (AC-1)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await getGameTracking(1942)).toEqual({ kind: "signed_out" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns no status and no score when the game is not in the list", async () => {
    expect(await getGameTracking(1942)).toEqual({
      kind: "ok",
      state: { status: null, rating: null },
    });
  });

  it("maps the row and scopes the query to the session user and game (AC-12)", async () => {
    response = { data: { status: "playing", rating: 8 }, error: null };
    expect(await getGameTracking(1942)).toEqual({
      kind: "ok",
      state: { status: "playing", rating: 8 },
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_game_state"] },
      { method: "select", args: ["status, rating"] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["game_id", 1942] },
    ]);
  });

  it("reports failed and logs only the event and outcome on a database error", async () => {
    response = {
      data: null,
      error: { code: "XX000", message: "secret detail" },
    };
    expect(await getGameTracking(1942)).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith("game_tracking.read refused db_error");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret detail");
  });
});
