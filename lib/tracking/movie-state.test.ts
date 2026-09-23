import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0007, AC-2, AC-16, AC-17, AC-21
 *
 * The reads are the only request scoped code behind the public movie routes.
 * The session and the database are the boundaries, so those are what is
 * replaced; the query builder records what it was asked.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const calls: { method: string; args: unknown[] }[] = [];
let response: { data: unknown; error: unknown } = { data: null, error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "in"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(response);
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(response);
  return chain;
}

// The client itself must not be thenable, or awaiting `createClient()` would
// resolve straight to the query result.
const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { getMovieTracking, getWatchlistedMovieIds, movieIdsKey } = await import(
  "./movie-state"
);

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

describe("getMovieTracking", () => {
  it("is signed out, with no session read, when the public env is missing (AC-2)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    expect(await getMovieTracking(550)).toEqual({ kind: "signed_out" });
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it("is signed out, with no query, for a visitor (AC-2)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await getMovieTracking(550)).toEqual({ kind: "signed_out" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns the empty state when there is no row", async () => {
    expect(await getMovieTracking(550)).toEqual({
      kind: "ok",
      state: { inWatchlist: false, watched: false, rating: null },
    });
  });

  it("maps the row and scopes the query to the session user", async () => {
    response = {
      data: {
        in_watchlist: true,
        watched_at: "2026-09-23T10:00:00Z",
        rating: 8,
      },
      error: null,
    };
    expect(await getMovieTracking(550)).toEqual({
      kind: "ok",
      state: { inWatchlist: true, watched: true, rating: 8 },
    });
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-a"] });
    expect(calls).toContainEqual({ method: "eq", args: ["movie_id", 550] });
  });

  it("reports a failed read and logs it with no identifiers (AC-17, AC-21)", async () => {
    response = {
      data: null,
      error: { code: "PGRST000", message: "user-a 550" },
    };
    expect(await getMovieTracking(550)).toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledWith("movie_tracking.read refused db_error");
  });
});

describe("getWatchlistedMovieIds", () => {
  it("reads the planned ids for the whole grid in one query (AC-16)", async () => {
    response = { data: [{ movie_id: 550 }], error: null };
    const result = await getWatchlistedMovieIds(movieIdsKey([603, 550, 550]));
    expect(result).toEqual({ kind: "ok", state: new Set([550]) });
    expect(calls).toContainEqual({
      method: "in",
      args: ["movie_id", [550, 603]],
    });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["in_watchlist", true],
    });
  });

  it("is signed out for a visitor (AC-2)", async () => {
    getOptionalUser.mockResolvedValue(null);
    expect(await getWatchlistedMovieIds("550")).toEqual({ kind: "signed_out" });
  });

  it("returns an empty set with no query for an empty grid", async () => {
    expect(await getWatchlistedMovieIds("")).toEqual({
      kind: "ok",
      state: new Set(),
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("is signed out, with no session read, when the public env is missing (AC-2)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    expect(await getWatchlistedMovieIds("550")).toEqual({
      kind: "signed_out",
    });
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it("scopes the grid query to the session user (AC-18)", async () => {
    response = { data: [], error: null };
    await getWatchlistedMovieIds("550,603");
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-a"] });
  });

  it("logs a failed grid read with no identifiers (AC-17, AC-21)", async () => {
    response = { data: null, error: { code: "PGRST000", message: "550" } };
    await getWatchlistedMovieIds("550,603");
    expect(warn).toHaveBeenCalledWith("movie_tracking.read refused db_error");
  });

  it("reports a failed read (AC-17)", async () => {
    response = { data: null, error: { code: "PGRST000" } };
    expect(await getWatchlistedMovieIds("550,603")).toEqual({ kind: "failed" });
  });
});

describe("movieIdsKey", () => {
  it("gives one key for the same ids in any order", () => {
    expect(movieIdsKey([3, 1, 2, 1])).toBe("1,2,3");
    expect(movieIdsKey([])).toBe("");
  });
});
