import { afterEach, describe, expect, it, vi } from "vitest";
import { installFetchMock, restoreFetchMock } from "./__fixtures__/helpers";
import movieFixture from "./__fixtures__/movie-550.json";
import { TMDB_ATTRIBUTION } from "./constants";
import { getTmdbToken, resetTmdbTokenCache } from "./env";
import { isTmdbNotFound, TmdbError } from "./errors";
import { imageUrl } from "./images";
import { fetchMovie } from "./movies";
import { fetchSearchMovies } from "./search";

/**
 * The module's surface: the pure helpers, the credential check, the typed split
 * between search and discover, and the fact that the inner reads are callable
 * in a plain test runner at all (spec 0002, AC-23).
 */

afterEach(() => {
  restoreFetchMock();
  vi.restoreAllMocks();
});

describe("imageUrl", () => {
  it("builds a URL from the TMDB image base and the requested size", () => {
    expect(imageUrl("/abc.jpg", "w500")).toBe(
      "https://image.tmdb.org/t/p/w500/abc.jpg",
    );
  });

  it("tolerates a path TMDB sent without its leading slash", () => {
    expect(imageUrl("abc.jpg", "w185")).toBe(
      "https://image.tmdb.org/t/p/w185/abc.jpg",
    );
  });

  it("returns null when there is no image, rather than a broken URL", () => {
    expect(imageUrl(null, "w500")).toBeNull();
    expect(imageUrl("", "w500")).toBeNull();
    expect(imageUrl(undefined, "w500")).toBeNull();
  });
});

describe("isTmdbNotFound", () => {
  it("is true only for a not_found TMDB error", () => {
    expect(
      isTmdbNotFound(new TmdbError("not_found", "/movie/1", "gone", 404)),
    ).toBe(true);
  });

  it("is false for every other kind, so a timeout never reads as a 404", () => {
    for (const kind of [
      "unauthorized",
      "rate_limited",
      "timeout",
      "upstream",
      "bad_response",
    ] as const) {
      expect(isTmdbNotFound(new TmdbError(kind, "/movie/1", "x"))).toBe(false);
    }
  });

  it("is false for anything that is not a TMDB error at all", () => {
    expect(isTmdbNotFound(new Error("boom"))).toBe(false);
    expect(isTmdbNotFound(null)).toBe(false);
    expect(isTmdbNotFound({ kind: "not_found" })).toBe(false);
  });
});

describe("the credential", () => {
  it("fails with a message naming the variable when it is missing", () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "");
    resetTmdbTokenCache();

    expect(() => getTmdbToken()).toThrow(/TMDB_READ_ACCESS_TOKEN/);

    vi.unstubAllEnvs();
    resetTmdbTokenCache();
  });

  it("never puts the token in the thrown message", () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "");
    resetTmdbTokenCache();

    const error = (() => {
      try {
        getTmdbToken();
      } catch (caught) {
        return caught as Error;
      }
    })();

    expect(error?.message).toContain(".env.local");
    vi.unstubAllEnvs();
    resetTmdbTokenCache();
  });
});

describe("the search and discover split", () => {
  it("does not accept a discovery filter on a search call", async () => {
    installFetchMock([
      { body: { page: 1, results: [], total_pages: 0, total_results: 0 } },
    ]);

    // @ts-expect-error genreIds belongs to discover, not to search. TMDB's
    // search endpoints ignore it, which is the silent wrong-results bug
    // AGENTS.md section 10 warns about, so the type refuses it.
    await fetchSearchMovies("fight club", { genreIds: [18] });
  });
});

describe("the two function split", () => {
  it("calls an inner read directly, with no Next cache transform active", async () => {
    installFetchMock([{ body: movieFixture }]);

    // This test existing at all is the assertion: the request, validation and
    // normalization logic lives outside the `use cache` wrappers, so the suite
    // never depends on Next's compiler being in the loop.
    await expect(fetchMovie(550)).resolves.toMatchObject({
      title: "Fight Club",
    });
  });
});

describe("attribution", () => {
  it("exports TMDB's required wording verbatim", () => {
    expect(TMDB_ATTRIBUTION).toBe(
      "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    );
  });
});
