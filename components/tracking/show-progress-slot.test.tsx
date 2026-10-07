import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0013, AC-10 to AC-12
 *
 * The reads are the boundary. These cases pin when the line gives way to
 * "Progress unavailable": a failed read of either kind, never a silent blank.
 */
const getShowStatus = vi.fn();
const getWatchedEpisodeIds = vi.fn();
vi.mock("@/lib/tracking/show-state", () => ({
  getShowTracking: (...args: unknown[]) => getShowStatus(...args),
  getWatchedEpisodeIds: (...args: unknown[]) => getWatchedEpisodeIds(...args),
  showIdsKey: (ids: number[]) => ids.join(","),
}));
const getShowEpisodes = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  getShowEpisodes: (...args: unknown[]) => getShowEpisodes(...args),
  TmdbError: class TmdbError extends Error {},
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-09-27",
}));

const { ShowProgressSlot } = await import("./show-progress-slot");

afterEach(() => {
  vi.clearAllMocks();
});

describe("ShowProgressSlot", () => {
  it("shows Progress unavailable with Try again when the status read fails", async () => {
    getShowStatus.mockResolvedValue({ kind: "failed" });
    getWatchedEpisodeIds.mockResolvedValue({ kind: "ok", state: new Map() });

    render(await ShowProgressSlot({ showId: 1396 }));

    expect(
      screen.getByText("Progress unavailable right now"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/shows/1396",
    );
    expect(getShowEpisodes).not.toHaveBeenCalled();
  });

  it("renders nothing for a show with no status and nothing watched", async () => {
    getShowStatus.mockResolvedValue({ kind: "ok", state: null });
    getWatchedEpisodeIds.mockResolvedValue({ kind: "ok", state: new Map() });

    expect(await ShowProgressSlot({ showId: 1396 })).toBeNull();
    expect(getShowEpisodes).not.toHaveBeenCalled();
  });
});
