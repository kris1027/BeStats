import { describe, expect, it } from "vitest";

import { ICON_KEY_ENTRIES } from "./icon-key";

/**
 * covers: prompts/mobile-look-account.md, decision 9 (one key for both apps).
 */
describe("the icon key", () => {
  it("lists eight marks once each, with a label for every one", () => {
    const marks = ICON_KEY_ENTRIES.map((entry) => entry.mark);
    expect(marks).toHaveLength(8);
    expect(new Set(marks).size).toBe(marks.length);
    for (const entry of ICON_KEY_ENTRIES) {
      expect(entry.label.trim()).not.toBe("");
    }
  });

  it("keeps each two state mark as a pair, action then done", () => {
    const marks = ICON_KEY_ENTRIES.map((entry) => entry.mark);
    expect(marks.indexOf("planned")).toBe(marks.indexOf("plan") + 1);
    expect(marks.indexOf("watched")).toBe(marks.indexOf("markWatched") + 1);
  });
});
