import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0012, AC-9, AC-10, AC-11, AC-13
 *
 * The show page's one private read. The session and the database are the
 * boundaries; the query builder records what it was asked, which pins the
 * owner scope and the single query.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const calls: { method: string; args: unknown[] }[] = [];
let response: { data: unknown; error: unknown } = { data: null, error: null };

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "not"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(response);
  return chain;
}

const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { getShowEpisodeRatings } = await import("./show-ratings");

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  getOptionalUser.mockResolvedValue({ id: "user-a", email: "a@example.test" });
  response = { data: [], error: null };
  calls.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("getShowEpisodeRatings", () => {
  it("reads the owner's rated rows for the show and places them by season", async () => {
    response = {
      data: [
        { season_number: 1, rating: 8 },
        { season_number: 0, rating: 10 },
      ],
      error: null,
    };
    await expect(getShowEpisodeRatings(1396)).resolves.toEqual({
      kind: "ok",
      state: [
        { seasonNumber: 1, rating: 8 },
        { seasonNumber: 0, rating: 10 },
      ],
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_episode_state"] },
      { method: "select", args: ["season_number, rating"] },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["show_id", 1396] },
      { method: "not", args: ["rating", "is", null] },
    ]);
  });

  it("is ok and empty when the user rated nothing in the show", async () => {
    response = { data: [], error: null };
    await expect(getShowEpisodeRatings(4)).resolves.toEqual({
      kind: "ok",
      state: [],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("drops a row with no rating instead of counting it as zero", async () => {
    response = {
      data: [
        { season_number: 1, rating: null },
        { season_number: 1, rating: 7 },
      ],
      error: null,
    };
    await expect(getShowEpisodeRatings(5)).resolves.toEqual({
      kind: "ok",
      state: [{ seasonNumber: 1, rating: 7 }],
    });
  });

  it("is signed out with no query for a visitor", async () => {
    getOptionalUser.mockResolvedValue(null);
    await expect(getShowEpisodeRatings(1)).resolves.toEqual({
      kind: "signed_out",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("is signed out with no session read when the public config is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(getShowEpisodeRatings(2)).resolves.toEqual({
      kind: "signed_out",
    });
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it("fails with one clean log line and no ids or ratings", async () => {
    response = { data: null, error: { code: "XX000", message: "boom" } };
    await expect(getShowEpisodeRatings(3)).resolves.toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.rating_read refused db_error",
    );
  });
});
