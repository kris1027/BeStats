/**
 * covers: spec 0033, AC-5 (show, season and episode writes run the server's
 * command), AC-7 (each Undo posts the `cleared` state its write returned),
 * and AGENTS.md section 7 (Stop tracking and a season unmark name only what
 * they change).
 */
const mockApiRequest = jest.fn();
jest.mock("./api", () => ({
  ApiError: class ApiError extends Error {},
  appVersion: () => "1.0.0",
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const {
  putEpisodeRating,
  putEpisodeWatched,
  putSeasonWatched,
  restoreEpisode,
  restoreSeason,
  restoreShowTracking,
  trackShow,
  untrackShow,
} = require("./shows") as typeof import("./shows");
const show =
  require("@bestats/core/api/v1/show") as typeof import("@bestats/core/api/v1/show");

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({ ok: true });
});

function lastCall() {
  const [path, schema, options] = mockApiRequest.mock.calls.at(-1) ?? [];
  return { path, schema, options };
}

describe("tracking", () => {
  test("Plan to watch sends PUT tracking with no body, so no mark is written", async () => {
    await trackShow(1399);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/shows/1399/tracking",
      schema: show.v1ShowTrackingOkSchema,
      options: { method: "PUT", auth: true },
    });
  });

  test("Stop tracking sends DELETE and reads the untrack answer", async () => {
    await untrackShow(1399);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/shows/1399/tracking",
      schema: show.v1UntrackShowOkSchema,
      options: { method: "DELETE", auth: true },
    });
  });

  test("the Undo of Stop tracking carries the original trackedAt", async () => {
    const cleared = {
      kind: "show_tracking",
      showId: 1399,
      undo: { trackedAt: "2026-10-01T08:00:00+00:00" },
    } as const;
    await restoreShowTracking(cleared);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/shows/1399/tracking/restore",
      schema: show.v1ShowTrackingOkSchema,
      options: { method: "POST", body: { cleared }, auth: true },
    });
  });
});

describe("episodes", () => {
  test("a watched mark names the show and season beside the episode", async () => {
    const body = { showId: 1399, season: 1, watched: true };
    await putEpisodeWatched(63056, body);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/episodes/63056",
      schema: show.v1EpisodeMarkOkSchema,
      options: { method: "PUT", body, auth: true },
    });
  });

  test("a score write reads the plain write answer, not the mark answer", async () => {
    await putEpisodeRating(63056, { showId: 1399, season: 1, rating: null });
    expect(lastCall().schema).toBe(show.v1EpisodeWriteOkSchema);
    expect(lastCall().options?.body).toEqual({
      showId: 1399,
      season: 1,
      rating: null,
    });
  });

  test("the Undo of a new mark posts the markedAt it stored", async () => {
    const cleared = {
      kind: "episode",
      showId: 1399,
      episodeId: 63056,
      markedAt: "2026-11-20T19:30:00+00:00",
    } as const;
    await restoreEpisode(cleared);
    expect(lastCall().path).toBe("/api/v1/me/episodes/63056/restore");
    expect(lastCall().options).toEqual({
      method: "POST",
      body: { cleared },
      auth: true,
    });
  });
});

describe("seasons", () => {
  test("marking a season sends only the flag, so the server picks the aired episodes", async () => {
    await putSeasonWatched(1399, 2, { watched: true });
    expect(lastCall()).toEqual({
      path: "/api/v1/me/shows/1399/seasons/2/watched",
      schema: show.v1SeasonWatchedOkSchema,
      options: { method: "PUT", body: { watched: true }, auth: true },
    });
  });

  test("unmarking a season names the episode ids the screen shows", async () => {
    await putSeasonWatched(1399, 2, { watched: false, episodeIds: [1, 2, 3] });
    expect(lastCall().options?.body).toEqual({
      watched: false,
      episodeIds: [1, 2, 3],
    });
  });

  test("specials use season 0 in the path", async () => {
    await putSeasonWatched(1399, 0, { watched: true });
    expect(lastCall().path).toBe("/api/v1/me/shows/1399/seasons/0/watched");
  });

  test("a season Undo is bound to its own season number", async () => {
    const cleared = {
      kind: "season" as const,
      showId: 1399,
      seasonNumber: 3,
      undo: { kind: "unmark" as const, episodeIds: [10, 11] },
    };
    await restoreSeason(cleared);
    expect(lastCall()).toEqual({
      path: "/api/v1/me/shows/1399/seasons/3/watched/restore",
      schema: show.v1EpisodeWriteOkSchema,
      options: { method: "POST", body: { cleared }, auth: true },
    });
  });

  test("a refused season write rejects instead of resolving", async () => {
    mockApiRequest.mockRejectedValue(new Error("offline"));
    await expect(putSeasonWatched(1399, 1, { watched: true })).rejects.toThrow(
      "offline",
    );
  });
});
