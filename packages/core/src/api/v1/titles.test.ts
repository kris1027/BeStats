import { describe, expect, it } from "vitest";

import { MAX_TITLE_KEYS, pickTitleState, titleIdsParamSchema } from "./titles";

/**
 * covers: spec 0035, API surface (`/me/titles`); AGENTS.md section 8, a title
 * is its media type plus its id.
 */
describe("titleIdsParamSchema", () => {
  it("reads movie, tv and game keys and drops repeats", () => {
    expect(
      titleIdsParamSchema.parse("movie:603,tv:603,game:12,movie:603"),
    ).toEqual([
      { type: "movie", id: 603 },
      { type: "tv", id: 603 },
      { type: "game", id: 12 },
    ]);
  });

  it("refuses an unknown type or an id out of bounds", () => {
    expect(titleIdsParamSchema.safeParse("book:1").success).toBe(false);
    expect(titleIdsParamSchema.safeParse("tv:0").success).toBe(false);
  });

  it("refuses an empty list or too many keys", () => {
    expect(titleIdsParamSchema.safeParse("").success).toBe(false);
    const many = Array.from(
      { length: MAX_TITLE_KEYS + 1 },
      (_, index) => `movie:${index + 1}`,
    ).join(",");
    expect(titleIdsParamSchema.safeParse(many).success).toBe(false);
  });
});

describe("pickTitleState", () => {
  const titles = {
    "movie:603": { planned: true, watchedAt: null, rating: null },
    "game:12": { status: "playing" as const, rating: 8 },
  };

  it("reads a key back narrowed to its type", () => {
    expect(pickTitleState(titles, "movie", 603)?.planned).toBe(true);
    expect(pickTitleState(titles, "game", 12)?.status).toBe("playing");
  });

  it("answers null for a missing key or another type's shape", () => {
    expect(pickTitleState(titles, "movie", 1)).toBeNull();
    expect(pickTitleState({ "tv:12": titles["game:12"] }, "tv", 12)).toBeNull();
  });
});
