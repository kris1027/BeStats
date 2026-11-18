import { describe, expect, it } from "vitest";

import { MAX_TITLE_KEYS, titleIdsParamSchema } from "./titles";

describe("titleIdsParamSchema", () => {
  it("reads movie keys and drops repeats", () => {
    expect(titleIdsParamSchema.parse("movie:603,movie:550,movie:603")).toEqual([
      603, 550,
    ]);
  });

  it("refuses show and game keys until they ship", () => {
    expect(titleIdsParamSchema.safeParse("tv:1399").success).toBe(false);
    expect(titleIdsParamSchema.safeParse("game:12").success).toBe(false);
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
