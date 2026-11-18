import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0017, AC-2
 *
 * TMDB's terms forbid altering its logo. The file is the official *Alt short
 * (blue)* SVG, downloaded unmodified, and this hash is the one recorded at
 * download (it is also the hash in TMDB's own file name). It sits here, not in
 * `public/`, because everything in `public/` is served. An edit of one byte,
 * a recolour or a reformat by a tool fails here before it ships.
 */
const LOGO = "public/tmdb-logo.svg";
const OFFICIAL_SHA256 =
  "8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c";

describe("the TMDB logo", () => {
  it("is the official file, byte for byte", () => {
    expect(existsSync(LOGO)).toBe(true);
    const hash = createHash("sha256").update(readFileSync(LOGO)).digest("hex");
    expect(hash).toBe(OFFICIAL_SHA256);
  });
});
