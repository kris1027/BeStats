import { describe, expect, it } from "vitest";

import { youtubeWatchUrl } from "./trailer";

describe("youtubeWatchUrl", () => {
  it("builds the watch page for a valid key", () => {
    expect(youtubeWatchUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("refuses a key that could escape the URL", () => {
    for (const key of ["", "abc", "a&list=1", "../../x", "a".repeat(21)]) {
      expect(youtubeWatchUrl(key)).toBeNull();
    }
  });
});
