import { describe, expect, it } from "vitest";

import { applyGameIntent } from "./game-intent";
import type { GameTrackingState } from "./types";

/**
 * covers: spec 0026, AC-5, AC-6, AC-11
 *
 * The reducer must give exactly what the SQL does, or the control flips
 * twice. Each case names the function it mirrors.
 */
const NONE: GameTrackingState = { status: null, rating: null };
const PLAYING_8: GameTrackingState = { status: "playing", rating: 8 };

describe("applyGameIntent", () => {
  it("sets a first status with no score (set_game_status insert)", () => {
    expect(
      applyGameIntent(NONE, { kind: "status", value: "finished" }),
    ).toEqual({ status: "finished", rating: null });
  });

  it("keeps the score between Playing and Finished (set_game_status)", () => {
    expect(
      applyGameIntent(PLAYING_8, { kind: "status", value: "finished" }),
    ).toEqual({ status: "finished", rating: 8 });
  });

  it("nulls the score on Want to play (set_game_status)", () => {
    expect(
      applyGameIntent(PLAYING_8, { kind: "status", value: "want_to_play" }),
    ).toEqual({ status: "want_to_play", rating: null });
  });

  it("empties the state on removal (remove_game)", () => {
    expect(applyGameIntent(PLAYING_8, { kind: "status", value: null })).toEqual(
      NONE,
    );
  });

  it("scores Playing or Finished (rate_game)", () => {
    expect(
      applyGameIntent(
        { status: "finished", rating: null },
        { kind: "rating", value: 9 },
      ),
    ).toEqual({ status: "finished", rating: 9 });
  });

  it("changes nothing for a score on no status or Want to play (rate_game BS004)", () => {
    expect(applyGameIntent(NONE, { kind: "rating", value: 9 })).toEqual(NONE);
    const want = { status: "want_to_play", rating: null } as const;
    expect(applyGameIntent(want, { kind: "rating", value: 9 })).toEqual(want);
  });

  it("clears a score and keeps the status (the plain update)", () => {
    expect(applyGameIntent(PLAYING_8, { kind: "rating", value: null })).toEqual(
      { status: "playing", rating: null },
    );
  });

  it("settles a queued Finished then score on the scored state (AC-7)", () => {
    const queued = applyGameIntent(
      applyGameIntent(NONE, { kind: "status", value: "finished" }),
      { kind: "rating", value: 7 },
    );
    expect(queued).toEqual({ status: "finished", rating: 7 });
  });
});
