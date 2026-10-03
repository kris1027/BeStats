import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0016, AC-13, AC-15
 *
 * A show page's canonical, `og:type` and share image are chosen in
 * `generateMetadata`, and a failed or missing show is kept out of the index
 * there. `loadShow` is replaced; the metadata helpers are the real ones.
 */
const loadShow = vi.fn();

vi.mock("./load-show", () => ({
  loadShow: (id: number) => loadShow(id),
}));

const { generateMetadata } = await import("./page");

const ORIGIN = "https://bestats.example";
const BACKDROP = "https://image.tmdb.org/t/p/w1280/backdrop.jpg";
const POSTER = "https://image.tmdb.org/t/p/w500/poster.jpg";

const SHOW = {
  name: "Breaking Bad",
  firstAirYear: 2008,
  overview: "A chemistry teacher turns to making methamphetamine.",
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
  loadShow.mockReset();
  vi.unstubAllEnvs();
});

describe("a found show's metadata (AC-13)", () => {
  it("declares its canonical, video.tv_show type and backdrop image", async () => {
    loadShow.mockResolvedValue({ kind: "found", show: SHOW });

    const metadata = await metadataFor("1396");

    expect(metadata.title).toBe("Breaking Bad (2008)");
    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/shows/1396`,
    });
    expect(metadata.openGraph).toMatchObject({
      type: "video.tv_show",
      url: `${ORIGIN}/shows/1396`,
      images: [BACKDROP],
    });
    expect(metadata.twitter?.images).toEqual([BACKDROP]);
  });

  it("falls back to the poster when there is no backdrop", async () => {
    loadShow.mockResolvedValue({
      kind: "found",
      show: { ...SHOW, backdropUrl: null },
    });

    const metadata = await metadataFor("1396");

    expect(metadata.openGraph?.images).toEqual([POSTER]);
  });
});

describe("a show page with nothing to show (AC-15)", () => {
  it.each([
    ["not found", { kind: "not_found" }, "Show not found"],
    ["a failed TMDB read", { kind: "failed" }, "Show"],
  ])(
    "is noindex with no canonical or share card for %s",
    async (_, result, title) => {
      loadShow.mockResolvedValue(result);

      const metadata = await metadataFor("1397");

      expect(metadata).toEqual({ title, robots: { index: false } });
    },
  );

  it("is noindex for a malformed id without asking TMDB", async () => {
    const metadata = await metadataFor("0");

    expect(metadata.robots).toEqual({ index: false });
    expect(loadShow).not.toHaveBeenCalled();
  });
});
