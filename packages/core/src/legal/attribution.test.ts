import { describe, expect, it } from "vitest";

import { TMDB_APP_ATTRIBUTION, TMDB_ATTRIBUTION } from "./attribution";

describe("TMDB attribution (spec 0017, AC-3; spec 0033, AC-14)", () => {
  it("keeps TMDB's required wording verbatim on the web", () => {
    expect(TMDB_ATTRIBUTION).toBe(
      "This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.",
    );
  });

  it("names the app an application, one of the terms' own nouns", () => {
    expect(TMDB_APP_ATTRIBUTION).toBe(
      "This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.",
    );
  });
});
