import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0016, AC-12, AC-15, AC-16
 *
 * `generateMetadata` is where a movie page picks its share image, its
 * `og:type` and its canonical, and where a failed or missing movie is kept out
 * of the index. `loadMovie` is replaced; the metadata helpers are the real
 * ones, so the whole head the page emits is checked.
 */
const loadMovie = vi.fn();

vi.mock("./load-movie", () => ({
  loadMovie: (id: number) => loadMovie(id),
}));

const { generateMetadata } = await import("./page");

const ORIGIN = "https://bestats.example";
const BACKDROP = "https://image.tmdb.org/t/p/w1280/backdrop.jpg";
const POSTER = "https://image.tmdb.org/t/p/w500/poster.jpg";

const MOVIE = {
  title: "Fight Club",
  releaseYear: 1999,
  overview: "An insomniac office worker forms an underground fight club.",
  backdropUrl: BACKDROP,
  posterUrl: POSTER,
};

function metadataFor(id: string) {
  return generateMetadata({
    params: Promise.resolve({ id }),
  } as Parameters<typeof generateMetadata>[0]);
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN));

afterEach(() => {
  loadMovie.mockReset();
  vi.unstubAllEnvs();
});

describe("a found movie's metadata (AC-12)", () => {
  it("declares its canonical, video.movie type and backdrop image", async () => {
    loadMovie.mockResolvedValue({ kind: "found", movie: MOVIE });

    const metadata = await metadataFor("550");

    expect(metadata.title).toBe("Fight Club (1999)");
    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/movies/550`,
    });
    expect(metadata.openGraph).toMatchObject({
      type: "video.movie",
      url: `${ORIGIN}/movies/550`,
      images: [BACKDROP],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [BACKDROP],
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("keeps the og:title free of the site name suffix", async () => {
    loadMovie.mockResolvedValue({ kind: "found", movie: MOVIE });

    const metadata = await metadataFor("550");

    expect(metadata.openGraph?.title).toBe("Fight Club (1999)");
  });

  it("falls back to the poster when there is no backdrop", async () => {
    loadMovie.mockResolvedValue({
      kind: "found",
      movie: { ...MOVIE, backdropUrl: null },
    });

    const metadata = await metadataFor("550");

    expect(metadata.openGraph?.images).toEqual([POSTER]);
  });

  it("uses the site card when TMDB has no artwork at all", async () => {
    loadMovie.mockResolvedValue({
      kind: "found",
      movie: { ...MOVIE, backdropUrl: null, posterUrl: null },
    });

    const metadata = await metadataFor("550");

    expect(metadata.openGraph?.images).toEqual([`${ORIGIN}/opengraph-image`]);
  });

  it("leaves the year and description out when TMDB has none", async () => {
    loadMovie.mockResolvedValue({
      kind: "found",
      movie: { ...MOVIE, releaseYear: null, overview: null },
    });

    const metadata = await metadataFor("550");

    expect(metadata.title).toBe("Fight Club");
    expect(metadata.description).toBeUndefined();
  });
});

describe("the canonical (AC-16)", () => {
  it("is built from the parsed id, so it is the same for every request of the title", async () => {
    loadMovie.mockResolvedValue({ kind: "found", movie: MOVIE });

    const metadata = await metadataFor("550");

    expect(loadMovie).toHaveBeenCalledWith(550);
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/movies/550`);
  });
});

describe("a movie page with nothing to show (AC-15)", () => {
  it.each([
    ["not found", { kind: "not_found" }, "Movie not found"],
    ["a failed TMDB read", { kind: "failed" }, "Movie"],
  ])(
    "is noindex with no canonical or share card for %s",
    async (_, result, title) => {
      loadMovie.mockResolvedValue(result);

      const metadata = await metadataFor("551");

      expect(metadata).toEqual({ title, robots: { index: false } });
    },
  );

  it("is noindex for a malformed id without asking TMDB", async () => {
    const metadata = await metadataFor("abc");

    expect(metadata).toEqual({
      title: "Movie not found",
      robots: { index: false },
    });
    expect(loadMovie).not.toHaveBeenCalled();
  });
});
