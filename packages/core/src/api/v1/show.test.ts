import { describe, expect, it } from "vitest";

import type {
  EpisodeTrackingResult,
  MarkEpisodeWatchedResult,
  SeasonWatchedResult,
  ShowTrackingResult,
  UntrackShowResult,
} from "../../tracking/types";
import {
  v1EpisodeMarkOkSchema,
  v1EpisodeWriteOkSchema,
  v1SeasonWatchedOkSchema,
  v1ShowTrackingOkSchema,
  v1UntrackShowOkSchema,
} from "./show";

/**
 * covers: spec 0035, Key invariants
 *
 * Each value is typed as the action's own result, so a field added to the
 * union without its schema fails here, and the schema parses it unchanged.
 */
describe("show and episode write results", () => {
  it("parses every success shape of the actions' results", () => {
    const write: EpisodeTrackingResult = { ok: true, showTracked: true };
    const marked: MarkEpisodeWatchedResult = {
      ok: true,
      showTracked: false,
      newlyMarked: true,
      markedAt: "2026-11-18T12:00:00+00:00",
    };
    const unmarked: MarkEpisodeWatchedResult = {
      ok: true,
      showTracked: false,
      newlyMarked: false,
      markedAt: null,
    };
    const seasonMark: SeasonWatchedResult = {
      ok: true,
      showTracked: false,
      undo: { kind: "unmark", episodeIds: [62085, 62086] },
    };
    const seasonUnmark: SeasonWatchedResult = {
      ok: true,
      showTracked: false,
      undo: {
        kind: "restore",
        entries: [{ episodeId: 62085, watchedAt: "2026-11-18T12:00:00+00:00" }],
      },
    };
    const seasonNoop: SeasonWatchedResult = {
      ok: true,
      showTracked: false,
      undo: null,
    };
    const tracked: ShowTrackingResult = { ok: true };
    const stopped: UntrackShowResult = {
      ok: true,
      undo: { trackedAt: "2026-11-01T09:00:00+00:00" },
    };
    const alreadyStopped: UntrackShowResult = { ok: true, undo: null };

    expect(v1EpisodeWriteOkSchema.parse(write)).toEqual(write);
    expect(v1EpisodeMarkOkSchema.parse(marked)).toEqual(marked);
    expect(v1EpisodeMarkOkSchema.parse(unmarked)).toEqual(unmarked);
    for (const body of [seasonMark, seasonUnmark, seasonNoop]) {
      expect(v1SeasonWatchedOkSchema.parse(body)).toEqual(body);
    }
    expect(v1ShowTrackingOkSchema.parse(tracked)).toEqual(tracked);
    expect(v1UntrackShowOkSchema.parse(stopped)).toEqual(stopped);
    expect(v1UntrackShowOkSchema.parse(alreadyStopped)).toEqual(alreadyStopped);
  });

  it("refuses a markedAt without a new mark, and a new mark without one", () => {
    const base = { ok: true, showTracked: false };
    expect(
      v1EpisodeMarkOkSchema.safeParse({
        ...base,
        newlyMarked: false,
        markedAt: "2026-11-18T12:00:00+00:00",
      }).success,
    ).toBe(false);
    expect(
      v1EpisodeMarkOkSchema.safeParse({
        ...base,
        newlyMarked: true,
        markedAt: null,
      }).success,
    ).toBe(false);
  });

  it("refuses a refusal body", () => {
    const refused = { ok: false, error: "not_found" };
    expect(v1EpisodeWriteOkSchema.safeParse(refused).success).toBe(false);
    expect(v1SeasonWatchedOkSchema.safeParse(refused).success).toBe(false);
    expect(v1ShowTrackingOkSchema.safeParse(refused).success).toBe(false);
  });
});
