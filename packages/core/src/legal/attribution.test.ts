import { describe, expect, it } from "vitest";

import { TMDB_ATTRIBUTION } from "./attribution";

describe("TMDB attribution (spec 0017, AC-3)", () => {
  it("keeps TMDB's required wording verbatim", () => {
    expect(TMDB_ATTRIBUTION).toBe(
      "This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.",
    );
  });
});
