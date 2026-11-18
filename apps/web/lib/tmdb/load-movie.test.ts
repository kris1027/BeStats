import { afterEach, describe, expect, it, vi } from "vitest";

import { TmdbError } from "@/lib/tmdb/errors";

/**
 * covers: spec 0006, AC-9, AC-10
 *
 * The page body and its metadata both branch on `loadMovie`, so its three
 * outcomes are the contract. The cached read is replaced; `TmdbError` and
 * `isTmdbNotFound` are the real ones, so the kind check is exercised as is.
 */
const getMovie = vi.fn();

vi.mock("@/lib/tmdb", async () => {
  const errors = await import("@/lib/tmdb/errors");
  return {
    getMovie: (id: number) => getMovie(id),
    isTmdbNotFound: errors.isTmdbNotFound,
    TmdbError: errors.TmdbError,
  };
});

const { loadMovie } = await import("./load-movie");

afterEach(() => getMovie.mockReset());

describe("loadMovie", () => {
  it("returns the movie when TMDB has it", async () => {
    getMovie.mockResolvedValue({ id: 550, title: "Fight Club", adult: false });

    const result = await loadMovie(550);

    expect(result).toEqual({
      kind: "found",
      movie: { id: 550, title: "Fight Club", adult: false },
    });
  });

  it("reports an adult flagged movie as not found", async () => {
    getMovie.mockResolvedValue({ id: 1, title: "x", adult: true });

    expect(await loadMovie(1)).toEqual({ kind: "not_found" });
  });

  it("reports a TMDB not_found as not found", async () => {
    getMovie.mockRejectedValue(
      new TmdbError("not_found", "/movie/999", "gone", 404),
    );

    expect(await loadMovie(999)).toEqual({ kind: "not_found" });
  });

  it.each([
    "timeout",
    "rate_limited",
    "upstream",
    "unauthorized",
    "bad_response",
  ] as const)(
    "reports a %s failure as failed, never as not found",
    async (kind) => {
      getMovie.mockRejectedValue(new TmdbError(kind, "/movie/550", "x"));

      expect(await loadMovie(550)).toEqual({ kind: "failed" });
    },
  );

  it("rethrows anything that is not a TMDB error", async () => {
    const bug = new TypeError("bug");
    getMovie.mockRejectedValue(bug);

    await expect(loadMovie(550)).rejects.toBe(bug);
  });
});
