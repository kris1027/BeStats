import { v1ConfigSchema } from "@bestats/core/api/v1/config";
import { v1ErrorBodySchema } from "@bestats/core/api/v1/errors";
import {
  v1MovieSchema,
  v1MovieWriteOkSchema,
} from "@bestats/core/api/v1/movie";
import { v1TitlesSchema } from "@bestats/core/api/v1/titles";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import movieFixture from "@/lib/tmdb/__fixtures__/movie-550.json";
import { normalizeMovie } from "@/lib/tmdb/normalize";

/**
 * covers: spec 0033, AC-4, AC-5, AC-6 (movies), AC-8, AC-9 for the tracer
 * routes; every response body is parsed with its core schema, so the app and
 * the API cannot drift (child 0035, key invariants).
 *
 * TMDB (`loadMovie`) and Supabase (the bearer check and its client) are the
 * boundaries; the watched route runs the real shared command.
 */
const loadMovie = vi.fn();
vi.mock("@/lib/tmdb/load-movie", () => ({ loadMovie }));

const verifyBearer = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyBearer }));

const { GET: getConfig } = await import("./config/route");
const { GET: getMovie } = await import("./movies/[id]/route");
const { PUT: putWatched } = await import("./me/movies/[id]/watched/route");
const { GET: getTitles } = await import("./me/titles/route");

const VERSION = { "X-BeStats-App-Version": "1.0.0" };
const AUTH = { ...VERSION, Authorization: "Bearer a.b.c" };
const MOVIE = normalizeMovie(movieFixture as never);

const calls: { method: string; args: unknown[] }[] = [];
let dbResult: { data: unknown; error: unknown } = { data: null, error: null };

function fakeClient() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "eq", "in", "rpc", "single"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(dbResult);
  return {
    from: chain.from as () => unknown,
    rpc: chain.rpc as () => unknown,
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  calls.length = 0;
  dbResult = { data: null, error: null };
  verifyBearer.mockResolvedValue({ userId: "user-a", client: fakeClient() });
  loadMovie.mockResolvedValue({ kind: "found", movie: MOVIE });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  warn.mockRestore();
});

const ctx = (params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
});

function req(
  path: string,
  headers: Record<string, string>,
  init: { method?: string; body?: unknown } = {},
) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function code(response: Response) {
  return v1ErrorBodySchema.parse(await response.json()).error;
}

describe("GET /api/v1/config", () => {
  it("answers the minimum version without a version header", async () => {
    const response = await getConfig(req("/api/v1/config", {}), ctx());
    expect(response.status).toBe(200);
    expect(v1ConfigSchema.parse(await response.json())).toEqual({
      minAppVersion: "1.0.0",
      apiVersion: 1,
    });
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=60");
  });
});

describe("GET /api/v1/movies/{id}", () => {
  it("answers the movie, publicly cacheable", async () => {
    const response = await getMovie(
      req("/api/v1/movies/550", VERSION),
      ctx({ id: "550" }),
    );
    expect(response.status).toBe(200);
    const body = v1MovieSchema.parse(await response.json());
    expect(body.id).toBe(MOVIE.id);
    expect(body.releaseDate).toBe(MOVIE.releaseDate);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    expect(verifyBearer).not.toHaveBeenCalled();
  });

  it("answers 404, 502 and 400, never cached", async () => {
    loadMovie.mockResolvedValueOnce({ kind: "not_found" });
    let response = await getMovie(
      req("/api/v1/movies/9", VERSION),
      ctx({ id: "9" }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    loadMovie.mockResolvedValueOnce({ kind: "failed" });
    response = await getMovie(
      req("/api/v1/movies/9", VERSION),
      ctx({ id: "9" }),
    );
    expect(response.status).toBe(502);
    expect((await code(response)).code).toBe("catalog_unavailable");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    response = await getMovie(
      req("/api/v1/movies/abc", VERSION),
      ctx({ id: "abc" }),
    );
    expect(response.status).toBe(400);
  });

  it("answers 426 to an old app", async () => {
    const response = await getMovie(
      req("/api/v1/movies/550", { "X-BeStats-App-Version": "0.9.0" }),
      ctx({ id: "550" }),
    );
    expect(response.status).toBe(426);
    expect(loadMovie).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/me/movies/{id}/watched", () => {
  const put = (
    body: unknown,
    headers: Record<string, string> = AUTH,
    id = "550",
  ) =>
    putWatched(
      req(`/api/v1/me/movies/${id}/watched`, headers, { method: "PUT", body }),
      ctx({ id }),
    );

  it("marks a released movie watched for the verified user", async () => {
    const response = await put({ watched: true });
    expect(response.status).toBe(200);
    expect(v1MovieWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
    });
    expect(calls).toContainEqual({
      method: "rpc",
      args: ["mark_movie_watched", { p_movie_id: 550 }],
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers 409 not_released before release day (UTC) and writes nothing", async () => {
    loadMovie.mockResolvedValue({
      kind: "found",
      movie: { ...MOVIE, releaseDate: "2026-11-19" },
    });
    const response = await put({ watched: true });
    expect(response.status).toBe(409);
    const error = await code(response);
    expect(error.code).toBe("not_released");
    expect(error.reason).toBe("not_released");
    expect(calls).toEqual([]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("clears a mark on an unreleased movie, returning what it cleared", async () => {
    loadMovie.mockResolvedValue({
      kind: "found",
      movie: { ...MOVIE, releaseDate: "2026-11-19" },
    });
    dbResult = {
      data: {
        cleared_watched_at: "2026-11-10T09:00:00+00:00",
        cleared_rating: 6,
      },
      error: null,
    };
    const response = await put({ watched: false });
    expect(response.status).toBe(200);
    expect(v1MovieWriteOkSchema.parse(await response.json())).toEqual({
      ok: true,
      cleared: { watchedAt: "2026-11-10T09:00:00+00:00", rating: 6 },
    });
  });

  it("answers 400 for a bad id or body, writing nothing", async () => {
    expect((await put({ watched: "yes" })).status).toBe(400);
    expect((await put({ watched: true }, AUTH, "0")).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("answers 401 when the token does not verify, writing nothing", async () => {
    verifyBearer.mockResolvedValue(null);
    const response = await put({ watched: true }, VERSION);
    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
    expect(loadMovie).not.toHaveBeenCalled();
  });

  it("answers 502 when TMDB is down", async () => {
    loadMovie.mockResolvedValue({ kind: "failed" });
    const response = await put({ watched: true });
    expect(response.status).toBe(502);
    expect((await code(response)).reason).toBe("tmdb_unavailable");
  });
});

describe("GET /api/v1/me/titles", () => {
  it("answers every asked key, empty when the user has no row", async () => {
    dbResult = {
      data: [
        {
          movie_id: 550,
          in_watchlist: false,
          watched_at: "2026-11-10T09:00:00+00:00",
          rating: 9,
        },
      ],
      error: null,
    };
    const response = await getTitles(
      req("/api/v1/me/titles?ids=movie:550,movie:603", AUTH),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(v1TitlesSchema.parse(await response.json())).toEqual({
      "movie:550": {
        planned: false,
        watchedAt: "2026-11-10T09:00:00+00:00",
        rating: 9,
      },
      "movie:603": { planned: false, watchedAt: null, rating: null },
    });
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-a"] });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers 400 for an unknown title type", async () => {
    const response = await getTitles(
      req("/api/v1/me/titles?ids=book:1399", AUTH),
      ctx(),
    );
    expect(response.status).toBe(400);
  });

  it("answers 500 when the read fails", async () => {
    dbResult = { data: null, error: { code: "XX000" } };
    const response = await getTitles(
      req("/api/v1/me/titles?ids=movie:550", AUTH),
      ctx(),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
