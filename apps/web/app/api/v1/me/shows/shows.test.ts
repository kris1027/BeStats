import { v1ErrorBodySchema } from "@bestats/core/api/v1/errors";
import {
  v1SeasonSchema,
  v1SeasonStateSchema,
  v1ShowSchema,
} from "@bestats/core/api/v1/show";
import { pickTitleState, v1TitlesSchema } from "@bestats/core/api/v1/titles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import seasonFixture from "@/lib/tmdb/__fixtures__/season-1396-1.json";
import showFixture from "@/lib/tmdb/__fixtures__/tv-1396.json";
import { normalizeSeasonDetail, normalizeTvShow } from "@/lib/tmdb/normalize";

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
 * covers: spec 0033, AC-5, AC-6 (episodes), AC-7, AC-8 for the show routes,
 * and the `tv:` keys of `/me/titles`. TMDB and Supabase are the boundaries;
 * each write runs the real shared command, and every body parses with its
 * core schema (spec 0035, key invariants).
 */
const loadShow = vi.fn();
vi.mock("@/lib/tmdb/load-show", () => ({ loadShow }));
const loadSeason = vi.fn();
vi.mock("@/lib/tmdb/load-season", () => ({ loadSeason }));
const getShowEpisodes = vi.fn();
vi.mock("@/lib/tmdb", () => ({ getShowEpisodes }));
const verifyBearer = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyBearer }));

const { GET: getShow } = await import("../../shows/[id]/route");
const { GET: getSeason } = await import("../../shows/[id]/seasons/[n]/route");
const { GET: getSeasonState } = await import("./[id]/seasons/[n]/route");
const { PUT: putEpisode } = await import("../episodes/[episodeId]/route");
const { POST: restoreEpisode } = await import(
  "../episodes/[episodeId]/restore/route"
);
const { PUT: putSeasonWatched } = await import(
  "./[id]/seasons/[n]/watched/route"
);
const { POST: restoreSeason } = await import(
  "./[id]/seasons/[n]/watched/restore/route"
);
const { PUT: track, DELETE: untrack } = await import("./[id]/tracking/route");
const { POST: restoreTracking } = await import("./[id]/tracking/restore/route");
const { GET: getTitles } = await import("../titles/route");

const SHOW = normalizeTvShow(showFixture as never);
const SEASON = normalizeSeasonDetail(seasonFixture as never, 1396);
const FOUND_SEASON = { kind: "found", show: SHOW, season: SEASON };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  resetDb();
  verifyBearer.mockResolvedValue({ userId: "user-a", client: fakeClient() });
  loadShow.mockResolvedValue({ kind: "found", show: SHOW });
  loadSeason.mockResolvedValue(FOUND_SEASON);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function send(
  handler: (request: never, context: never) => Promise<Response>,
  path: string,
  params: Record<string, string>,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  return handler(
    req(path, init.headers ?? AUTH, init) as never,
    ctx(params) as never,
  );
}

describe("GET /api/v1/shows/{id} and /seasons/{n}", () => {
  it("answers the show, cached for 60 seconds", async () => {
    const response = await send(
      getShow,
      "/api/v1/shows/1396",
      { id: "1396" },
      {
        headers: VERSION,
      },
    );
    expect(response.status).toBe(200);
    const body = v1ShowSchema.parse(await response.json());
    expect(body.id).toBe(1396);
    expect(body.seasons.length).toBe(SHOW.seasons.length);
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=60");
    expect(verifyBearer).not.toHaveBeenCalled();
  });

  it("answers the season with its episodes", async () => {
    const response = await send(
      getSeason,
      "/api/v1/shows/1396/seasons/1",
      { id: "1396", n: "1" },
      { headers: VERSION },
    );
    const body = v1SeasonSchema.parse(await response.json());
    expect(body.show).toEqual({ id: 1396, name: SHOW.name });
    expect(body.episodes[0]?.id).toBe(62085);
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=60");
  });

  it("answers 404 for an unknown season and 502 for a TMDB outage, uncached", async () => {
    loadSeason.mockResolvedValueOnce({ kind: "season_not_found", show: SHOW });
    const missing = await send(
      getSeason,
      "/api/v1/shows/1396/seasons/99",
      { id: "1396", n: "99" },
      { headers: VERSION },
    );
    loadShow.mockResolvedValueOnce({ kind: "failed" });
    const down = await send(
      getShow,
      "/api/v1/shows/1396",
      { id: "1396" },
      {
        headers: VERSION,
      },
    );
    expect(missing.status).toBe(404);
    expect(down.status).toBe(502);
    expect(down.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("GET /api/v1/me/shows/{id}/seasons/{n}", () => {
  it("answers the caller's own rows, private", async () => {
    setDbResult({
      data: [
        {
          episode_id: 62085,
          watched_at: "2026-11-01T09:00:00+00:00",
          rating: 8,
        },
      ],
      error: null,
    });
    const response = await send(
      getSeasonState,
      "/api/v1/me/shows/1396/seasons/1",
      { id: "1396", n: "1" },
    );
    expect(v1SeasonStateSchema.parse(await response.json())).toEqual({
      episodes: [
        { episodeId: 62085, watchedAt: "2026-11-01T09:00:00+00:00", rating: 8 },
      ],
    });
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-a"] });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("PUT /api/v1/me/episodes/{episodeId}", () => {
  const put = (body: unknown, id = "62085") =>
    send(
      putEpisode,
      `/api/v1/me/episodes/${id}`,
      { episodeId: id },
      {
        method: "PUT",
        body,
      },
    );

  it("marks an aired episode with TMDB's numbers and returns markedAt", async () => {
    setDbResult({
      data: [
        {
          show_tracked: true,
          newly_marked: true,
          watched_at: "2026-11-18T12:00:00+00:00",
        },
      ],
      error: null,
    });
    const response = await put({
      showId: 1396,
      season: 1,
      watched: true,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      showTracked: true,
      newlyMarked: true,
      markedAt: "2026-11-18T12:00:00+00:00",
    });
    expect(calls).toContainEqual({
      method: "rpc",
      args: [
        "mark_episode_watched",
        {
          p_show_id: 1396,
          p_season_number: 1,
          p_episode_number: 1,
          p_episode_id: 62085,
        },
      ],
    });
  });

  it("answers 409 not_released (reason not_aired) for an episode still to air", async () => {
    loadSeason.mockResolvedValue({
      ...FOUND_SEASON,
      season: {
        ...SEASON,
        episodes: SEASON.episodes.map((episode) => ({
          ...episode,
          airDate: "2026-11-19",
        })),
      },
    });
    const response = await put({ showId: 1396, season: 1, rating: 9 });
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({
      code: "not_released",
      reason: "not_aired",
    });
    expect(calls.filter((call) => call.method === "rpc")).toEqual([]);
  });

  it("clears a rating with no TMDB read, keeping the mark", async () => {
    const response = await put({ showId: 1396, season: 1, rating: null });
    expect(response.status).toBe(200);
    expect(loadSeason).not.toHaveBeenCalled();
    expect(calls).toContainEqual({
      method: "update",
      args: [{ rating: null }],
    });
  });

  it("answers 400 for a body with neither a mark nor a rating", async () => {
    const response = await put({ showId: 1396, season: 1 });
    expect(response.status).toBe(400);
  });

  it("answers 400 for the old seasonNumber field, writing nothing", async () => {
    const response = await put({
      showId: 1396,
      seasonNumber: 1,
      watched: true,
    });
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("answers 400 for a mark and a rating together, writing nothing", async () => {
    const response = await put({
      showId: 1396,
      season: 1,
      watched: true,
      rating: 7,
    });
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("season watched and its restore", () => {
  it("marks only aired episodes and returns the Undo", async () => {
    setDbResult({
      data: [{ marked_ids: [62085, 62086], show_tracked: false }],
      error: null,
    });
    const response = await send(
      putSeasonWatched,
      "/api/v1/me/shows/1396/seasons/1/watched",
      { id: "1396", n: "1" },
      { method: "PUT", body: { watched: true } },
    );
    expect(await response.json()).toEqual({
      ok: true,
      undo: { kind: "unmark", episodeIds: [62085, 62086] },
      showTracked: false,
    });
  });

  it("restores with a season state and refuses another show's or season's", async () => {
    const cleared = {
      kind: "season",
      showId: 1396,
      seasonNumber: 1,
      undo: { kind: "unmark", episodeIds: [62085] },
    };
    const ok = await send(
      restoreSeason,
      "/api/v1/me/shows/1396/seasons/1/watched/restore",
      { id: "1396", n: "1" },
      { method: "POST", body: { cleared } },
    );
    const wrong = await send(
      restoreSeason,
      "/api/v1/me/shows/1/seasons/1/watched/restore",
      { id: "1", n: "1" },
      { method: "POST", body: { cleared } },
    );
    const otherSeason = await send(
      restoreSeason,
      "/api/v1/me/shows/1396/seasons/2/watched/restore",
      { id: "1396", n: "2" },
      { method: "POST", body: { cleared } },
    );
    expect(ok.status).toBe(200);
    expect(wrong.status).toBe(400);
    expect(otherSeason.status).toBe(400);
  });
});

describe("show tracking and its restore", () => {
  it("tracks after a TMDB check and answers 404 for an unknown show", async () => {
    expect(
      (
        await send(
          track,
          "/api/v1/me/shows/1396/tracking",
          { id: "1396" },
          {
            method: "PUT",
          },
        )
      ).status,
    ).toBe(200);
    loadShow.mockResolvedValueOnce({ kind: "not_found" });
    const missing = await send(
      track,
      "/api/v1/me/shows/1396/tracking",
      { id: "1396" },
      { method: "PUT" },
    );
    expect(missing.status).toBe(404);
  });

  it("stops tracking with an Undo, which the restore takes back", async () => {
    setDbResult({
      data: [{ tracked_at: "2026-11-01T09:00:00+00:00" }],
      error: null,
    });
    const stopped = await send(
      untrack,
      "/api/v1/me/shows/1396/tracking",
      {
        id: "1396",
      },
      { method: "DELETE" },
    );
    const body = (await stopped.json()) as { undo: { trackedAt: string } };
    expect(body.undo).toEqual({ trackedAt: "2026-11-01T09:00:00+00:00" });

    const restored = await send(
      restoreTracking,
      "/api/v1/me/shows/1396/tracking/restore",
      { id: "1396" },
      {
        method: "POST",
        body: {
          cleared: { kind: "show_tracking", showId: 1396, undo: body.undo },
        },
      },
    );
    expect(restored.status).toBe(200);
    expect(calls).toContainEqual({
      method: "rpc",
      args: [
        "restore_show_tracking",
        { p_show_id: 1396, p_tracked_at: "2026-11-01T09:00:00+00:00" },
      ],
    });
  });

  it("refuses an episode Undo on the tracking restore", async () => {
    const response = await send(
      restoreTracking,
      "/api/v1/me/shows/1396/tracking/restore",
      { id: "1396" },
      {
        method: "POST",
        body: {
          cleared: {
            kind: "episode",
            showId: 1396,
            episodeId: 62085,
            markedAt: "2026-11-01T09:00:00+00:00",
          },
        },
      },
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/me/episodes/{episodeId}/restore", () => {
  it("answers 409 undo_expired when the mark changed since", async () => {
    setDbResult({ data: [], error: null });
    const response = await send(
      restoreEpisode,
      "/api/v1/me/episodes/62085/restore",
      { episodeId: "62085" },
      {
        method: "POST",
        body: {
          cleared: {
            kind: "episode",
            showId: 1396,
            episodeId: 62085,
            markedAt: "2026-11-01T09:00:00+00:00",
          },
        },
      },
    );
    expect(response.status).toBe(409);
    expect(v1ErrorBodySchema.parse(await response.json()).error.reason).toBe(
      "undo_expired",
    );
  });
});

describe("GET /api/v1/me/titles with tv keys", () => {
  it("answers tracking, progress and full precision ratings", async () => {
    setDbResult(
      { data: [{ show_id: 1396 }], error: null },
      {
        data: [
          {
            show_id: 1396,
            episode_id: 62085,
            season_number: 1,
            watched_at: "2026-11-01T09:00:00+00:00",
            rating: 8,
          },
          {
            show_id: 1396,
            episode_id: 62086,
            season_number: 1,
            watched_at: null,
            rating: 7,
          },
          {
            show_id: 1396,
            episode_id: 99,
            season_number: 2,
            watched_at: null,
            rating: 6,
          },
          {
            show_id: 1396,
            episode_id: 98,
            season_number: 0,
            watched_at: null,
            rating: 1,
          },
        ],
        error: null,
      },
    );
    getShowEpisodes.mockResolvedValue({ episodes: SEASON.episodes });
    const response = await send(getTitles, "/api/v1/me/titles?ids=tv:1396", {});
    const titles = v1TitlesSchema.parse(await response.json());
    const state = pickTitleState(titles, "tv", 1396);
    expect(state?.tracked).toBe(true);
    expect(state?.progress).toMatchObject({
      kind: "counted",
      watched: 1,
      total: SEASON.episodes.length,
    });
    expect(state?.seasonRatings).toEqual([
      { seasonNumber: 0, mean: 1, ratedEpisodes: 1 },
      { seasonNumber: 1, mean: 7.5, ratedEpisodes: 2 },
      { seasonNumber: 2, mean: 6, ratedEpisodes: 1 },
    ]);
    // Seasons rated 7.5 and 6 give 6.75; Specials never count (AGENTS.md section 9).
    expect(state?.showRating).toBe(6.75);
  });

  it("keeps the user's state with null progress when TMDB is down", async () => {
    setDbResult({ data: [], error: null });
    getShowEpisodes.mockRejectedValue(new Error("down"));
    const response = await send(getTitles, "/api/v1/me/titles?ids=tv:1396", {});
    const state = pickTitleState(
      v1TitlesSchema.parse(await response.json()),
      "tv",
      1396,
    );
    expect(state).toEqual({
      tracked: false,
      progress: null,
      seasonRatings: [],
      showRating: null,
    });
  });
});
