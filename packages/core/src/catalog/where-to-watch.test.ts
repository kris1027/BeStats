import { describe, expect, it } from "vitest";

import {
  ageRatingLabel,
  notStreamingLine,
  WHERE_TO_WATCH_GROUPS,
  whereToWatchHeading,
} from "./where-to-watch";

describe("Where to watch copy", () => {
  it("names the country when it is known", () => {
    expect(whereToWatchHeading("Poland")).toBe("Where to watch in Poland");
    expect(whereToWatchHeading(null)).toBe("Where to watch");
    expect(notStreamingLine("Poland")).toBe(
      "Not streaming in Poland right now.",
    );
    expect(ageRatingLabel("Poland")).toBe("Age rating in Poland");
  });

  it("keeps the AC-12 group order", () => {
    expect(WHERE_TO_WATCH_GROUPS.map((group) => group.label)).toEqual([
      "Stream",
      "Free",
      "Rent or buy",
    ]);
  });
});
