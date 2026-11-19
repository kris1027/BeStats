import { describe, expect, it } from "vitest";

import type { GameTrackingResult } from "../../tracking/types";
import {
  GAME_ERROR_TO_V1,
  gameIdParamSchema,
  v1GameBodySchema,
  v1GameWriteOkSchema,
} from "./game";

const previous = {
  status: "finished" as const,
  rating: 8,
  addedAt: "2026-10-01T09:00:00+00:00",
  startedAt: "2026-10-02T09:00:00+00:00",
  finishedAt: "2026-10-20T09:00:00+00:00",
};

/** covers: spec 0035, API surface and Key invariants (game routes) */
describe("game contracts", () => {
  it("parses every success shape of the game actions", () => {
    const plain: GameTrackingResult = { ok: true };
    const status: GameTrackingResult = {
      ok: true,
      undo: { kind: "status", previous },
    };
    const removed: GameTrackingResult = {
      ok: true,
      undo: {
        kind: "removed",
        previous,
        removedAt: "2026-11-18T12:00:00+00:00",
      },
    };
    for (const result of [plain, status, removed]) {
      expect(v1GameWriteOkSchema.parse(result)).toEqual(result);
    }
  });

  it("takes a status or a score, never both", () => {
    expect(v1GameBodySchema.safeParse({ status: "playing" }).success).toBe(
      true,
    );
    expect(v1GameBodySchema.safeParse({ rating: null }).success).toBe(true);
    expect(v1GameBodySchema.safeParse({ rating: 7 }).success).toBe(true);
    expect(
      v1GameBodySchema.safeParse({ status: "playing", rating: 7 }).success,
    ).toBe(false);
    expect(v1GameBodySchema.safeParse({}).success).toBe(false);
    expect(v1GameBodySchema.safeParse({ status: "dropped" }).success).toBe(
      false,
    );
    expect(v1GameBodySchema.safeParse({ rating: 11 }).success).toBe(false);
  });

  it("reads a path id within the game id bounds", () => {
    expect(gameIdParamSchema.parse("1942")).toBe(1942);
    expect(gameIdParamSchema.safeParse("0").success).toBe(false);
    expect(gameIdParamSchema.safeParse("abc").success).toBe(false);
  });

  it("answers the release gate with not_released and a score refusal as conflict", () => {
    expect(GAME_ERROR_TO_V1.not_released).toBe("not_released");
    expect(GAME_ERROR_TO_V1.not_started).toBe("conflict");
    expect(GAME_ERROR_TO_V1.igdb_unavailable).toBe("catalog_unavailable");
  });
});
