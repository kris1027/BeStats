import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0012, AC-9, AC-10, AC-11, AC-13
 *
 * The show page's one private read. The session and the database are the
 * boundaries; the query builder records what it was asked, which pins the
 * owner scope, the stable order and the keyset paging. A page's `count` is
 * what remains past its cursor, as PostgREST reports it for the filtered
 * query.
 */
const getOptionalUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));

const calls: { method: string; args: unknown[] }[] = [];
type Response = { data: unknown; count: number | null; error: unknown };
let responses: Response[] = [];

/** One page answering every row it lists, the whole result in one response. */
function page(data: unknown[]): Response {
  return { data, count: data.length, error: null };
}

function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "select",
    "eq",
    "gt",
    "not",
    "order",
    "range",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve(responses.shift() ?? page([]));
  return chain;
}

const createClient = vi.fn(async () => ({
  from: (...args: unknown[]) =>
    (builder().from as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { getShowEpisodeRatings, SHOW_RATINGS_PAGE_SIZE } = await import(
  "./show-ratings"
);

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  getOptionalUser.mockResolvedValue({ id: "user-a", email: "a@example.test" });
  responses = [];
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
    responses = [
      page([
        { episode_id: 62085, season_number: 1, rating: 8 },
        { episode_id: 62090, season_number: 0, rating: 10 },
      ]),
    ];
    await expect(getShowEpisodeRatings(1396)).resolves.toEqual({
      kind: "ok",
      state: [
        { seasonNumber: 1, rating: 8 },
        { seasonNumber: 0, rating: 10 },
      ],
    });
    expect(calls).toEqual([
      { method: "from", args: ["user_episode_state"] },
      {
        method: "select",
        args: ["episode_id, season_number, rating", { count: "exact" }],
      },
      { method: "eq", args: ["user_id", "user-a"] },
      { method: "eq", args: ["show_id", 1396] },
      { method: "not", args: ["rating", "is", null] },
      { method: "order", args: ["episode_id"] },
      { method: "range", args: [0, SHOW_RATINGS_PAGE_SIZE - 1] },
    ]);
  });

  it("pages past the API row cap instead of dropping ratings", async () => {
    let id = 0;
    const rows = (n: number, rating: number) =>
      Array.from({ length: n }, () => ({
        episode_id: ++id,
        season_number: 1,
        rating,
      }));
    // A server cap below the page size: each response holds 600 rows.
    responses = [
      { data: rows(600, 8), count: 1500, error: null },
      { data: rows(600, 6), count: 900, error: null },
      { data: rows(300, 4), count: 300, error: null },
    ];
    const result = await getShowEpisodeRatings(37854);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.state).toHaveLength(1500);
    expect(calls.filter((call) => call.method === "range")).toEqual(
      Array(3).fill({ method: "range", args: [0, SHOW_RATINGS_PAGE_SIZE - 1] }),
    );
  });

  it("starts each page after the last episode read, so a rating cleared mid read skips no other row", async () => {
    // Page 1 ends at episode 600. Whatever changed below it since, page 2
    // asks for the rows past 600, never for an offset that shifted.
    responses = [
      {
        data: [
          { episode_id: 10, season_number: 1, rating: 6 },
          { episode_id: 600, season_number: 1, rating: 6 },
        ],
        count: 3,
        error: null,
      },
      {
        data: [{ episode_id: 601, season_number: 2, rating: 10 }],
        count: 1,
        error: null,
      },
    ];
    const result = await getShowEpisodeRatings(37854);
    expect(result).toEqual({
      kind: "ok",
      state: [
        { seasonNumber: 1, rating: 6 },
        { seasonNumber: 1, rating: 6 },
        { seasonNumber: 2, rating: 10 },
      ],
    });
    expect(calls.filter((call) => call.method === "gt")).toEqual([
      { method: "gt", args: ["episode_id", 600] },
    ]);
  });

  it("stops on an empty page when rows vanish mid read", async () => {
    responses = [
      {
        data: [{ episode_id: 1, season_number: 1, rating: 9 }],
        count: 5,
        error: null,
      },
      { data: [], count: 1, error: null },
    ];
    await expect(getShowEpisodeRatings(6)).resolves.toEqual({
      kind: "ok",
      state: [{ seasonNumber: 1, rating: 9 }],
    });
  });

  it("fails when a later page fails rather than returning a partial average", async () => {
    responses = [
      {
        data: [{ episode_id: 1, season_number: 1, rating: 9 }],
        count: SHOW_RATINGS_PAGE_SIZE + 1,
        error: null,
      },
      { data: null, count: null, error: { code: "57014", message: "timeout" } },
    ];
    await expect(getShowEpisodeRatings(7)).resolves.toEqual({ kind: "failed" });
  });

  it("is ok and empty when the user rated nothing in the show", async () => {
    responses = [page([])];
    await expect(getShowEpisodeRatings(4)).resolves.toEqual({
      kind: "ok",
      state: [],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("drops a row with no rating instead of counting it as zero", async () => {
    responses = [
      page([
        { episode_id: 1, season_number: 1, rating: null },
        { episode_id: 2, season_number: 1, rating: 7 },
      ]),
    ];
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
    responses = [
      { data: null, count: null, error: { code: "XX000", message: "boom" } },
    ];
    await expect(getShowEpisodeRatings(3)).resolves.toEqual({ kind: "failed" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "show_tracking.rating_read refused db_error",
    );
  });
});
