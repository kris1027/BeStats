import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0032, AC-10
 *
 * The footer credits IGDB with its own logo, the *IGDB logo (SVG)* file from
 * IGDB's press kit (https://www.igdb.com/press), downloaded unmodified on
 * 2026-10-26. The Twitch Developer Services Agreement forbids altering
 * attribution notices, so this hash, recorded at download, fails an edit of
 * one byte, a recolour or a reformat by a tool before it ships, as
 * `tmdb-logo.test.ts` does for TMDB's file.
 */
const LOGO = "public/igdb-logo.svg";
const OFFICIAL_SHA256 =
  "5269511c541a125f7dd8c71990e0c86ff4a6881be29ad8bd81e1ae4fe83527df";

describe("the IGDB logo", () => {
  it("is the official file, byte for byte", () => {
    expect(existsSync(LOGO)).toBe(true);
    const hash = createHash("sha256").update(readFileSync(LOGO)).digest("hex");
    expect(hash).toBe(OFFICIAL_SHA256);
  });
});
