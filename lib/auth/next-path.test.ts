import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIGNED_IN_PATH,
  isSafeNextPath,
  safeNextPath,
} from "./next-path";

/**
 * covers: spec 0005, AC-11
 *
 * The `next` value is the one piece of attacker controlled input that decides
 * where a freshly signed in person is sent. Getting it wrong turns the sign in
 * page into an open redirect, which is exactly the surface a phishing link
 * wants: a real BeStats URL, a real sign in, then somewhere else entirely.
 *
 * The backslash cases are the ones worth spelling out. Browsers normalise
 * `/\evil.example` to `//evil.example`, which is protocol relative and leaves
 * the site, so a check that only looked for a leading `/` would pass it.
 */
describe("isSafeNextPath (AC-11)", () => {
  it.each([
    ["/shows", "a plain path"],
    ["/", "the site root"],
    ["/watchlist?filter=planned", "a path with a query string"],
    ["/movies/550", "a nested path"],
  ])("accepts %s (%s)", (value) => {
    expect(isSafeNextPath(value)).toBe(true);
  });

  it.each([
    ["https://evil.example", "an absolute URL"],
    ["http://evil.example/shows", "an absolute URL with a path"],
    ["//evil.example", "a protocol relative value"],
    ["/\\evil.example", "a backslash the browser normalises to //"],
    ["\\/\\/evil.example", "the doubled backslash form"],
    ["\\\\evil.example", "a UNC style path"],
    ["shows", "a bare relative value"],
    ["", "an empty string"],
  ])("rejects %s (%s)", (value) => {
    expect(isSafeNextPath(value)).toBe(false);
  });

  it("rejects an absent value rather than throwing", () => {
    expect(isSafeNextPath(null)).toBe(false);
    expect(isSafeNextPath(undefined)).toBe(false);
  });
});

describe("safeNextPath (AC-11)", () => {
  it("passes a safe path through unchanged", () => {
    expect(safeNextPath("/watchlist")).toBe("/watchlist");
  });

  it.each(["https://evil.example", "//evil.example", "shows", null])(
    "falls back to the catalog for %s",
    (value) => {
      expect(safeNextPath(value)).toBe(DEFAULT_SIGNED_IN_PATH);
    },
  );
});
