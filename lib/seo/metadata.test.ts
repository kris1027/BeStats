import { afterEach, describe, expect, it, vi } from "vitest";

import { catalogMetadata, landingMetadata } from "./metadata";

/**
 * covers: spec 0016, AC-3, AC-10, AC-11, AC-17
 *
 * Every public catalog page's canonical, Open Graph and X card come from
 * these two helpers, so their output with and without a site URL is the
 * contract.
 */
const ORIGIN = "https://bestats.example";
const TMDB_IMAGE = "https://image.tmdb.org/t/p/w1280/backdrop.jpg";

afterEach(() => vi.unstubAllEnvs());

describe("catalogMetadata (AC-10)", () => {
  it("builds the canonical, Open Graph and X card from one input", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${ORIGIN}/`);

    const metadata = catalogMetadata({
      title: "Fight Club (1999)",
      description: "An insomniac office worker...",
      path: "/movies/550",
      image: TMDB_IMAGE,
      ogType: "video.movie",
    });

    expect(metadata).toEqual({
      title: "Fight Club (1999)",
      description: "An insomniac office worker...",
      alternates: { canonical: `${ORIGIN}/movies/550` },
      openGraph: {
        title: "Fight Club (1999)",
        description: "An insomniac office worker...",
        url: `${ORIGIN}/movies/550`,
        siteName: "BeStats",
        locale: "en_US",
        type: "video.movie",
        images: [TMDB_IMAGE],
      },
      twitter: {
        card: "summary_large_image",
        title: "Fight Club (1999)",
        description: "An insomniac office worker...",
        images: [TMDB_IMAGE],
      },
    });
  });

  it("falls back to the site card when there is no TMDB image (AC-11)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    const metadata = catalogMetadata({
      title: "Movies",
      description: "Browse",
      path: "/movies",
      image: null,
      ogType: "website",
    });

    expect(metadata.openGraph?.images).toEqual([`${ORIGIN}/opengraph-image`]);
    expect(metadata.twitter?.images).toEqual([`${ORIGIN}/opengraph-image`]);
  });

  it("leaves a missing description undefined", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    const metadata = catalogMetadata({
      title: "Untitled",
      description: undefined,
      path: "/movies/1",
      image: null,
      ogType: "video.movie",
    });

    expect(metadata.description).toBeUndefined();
    expect(metadata.openGraph?.description).toBeUndefined();
  });

  describe("with no site URL (AC-3)", () => {
    it("omits the canonical and og:url but keeps a TMDB image", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);

      const metadata = catalogMetadata({
        title: "Fight Club (1999)",
        description: undefined,
        path: "/movies/550",
        image: TMDB_IMAGE,
        ogType: "video.movie",
      });

      expect(metadata.alternates).toBeUndefined();
      expect(metadata.openGraph?.url).toBeUndefined();
      expect(metadata.openGraph?.images).toEqual([TMDB_IMAGE]);
    });

    it("carries no image at all when there is no TMDB image", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);

      const metadata = catalogMetadata({
        title: "Movies",
        description: undefined,
        path: "/movies",
        image: null,
        ogType: "website",
      });

      expect(metadata.openGraph?.images).toBeUndefined();
      expect(metadata.twitter?.images).toBeUndefined();
    });
  });
});

describe("landingMetadata (AC-17)", () => {
  it("declares the page's own canonical with the site card", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    const metadata = landingMetadata("Movies", "Browse", "/movies?page=3");

    expect(metadata.alternates).toEqual({
      canonical: `${ORIGIN}/movies?page=3`,
    });
    expect(metadata.robots).toBeUndefined();
    expect(metadata.openGraph?.images).toEqual([`${ORIGIN}/opengraph-image`]);
  });

  it("is noindex with no canonical when the page shows no results", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    expect(landingMetadata("Movies", "Browse", null)).toEqual({
      title: "Movies",
      description: "Browse",
      robots: { index: false },
    });
  });
});
