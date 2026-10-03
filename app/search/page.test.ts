import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_QUERY_LENGTH } from "@/lib/search/constants";

/**
 * covers: spec 0016, AC-11, AC-18
 *
 * A results page per query would be endless thin content, so search is never
 * indexed and declares no canonical, yet a shared search link still unfurls
 * as the site card with one fixed description.
 */
const { generateMetadata } = await import("./page");

const ORIGIN = "https://bestats.example";
const DESCRIPTION =
  "Search movies and TV shows on BeStats by title, genre, release year and TMDB rating.";

function metadataFor(q?: string | string[]) {
  return generateMetadata({
    searchParams: Promise.resolve(q === undefined ? {} : { q }),
  } as Parameters<typeof generateMetadata>[0]);
}

afterEach(() => vi.unstubAllEnvs());

describe("the search page's metadata (AC-18)", () => {
  it("is noindex but followed, with no canonical and the site card", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    const metadata = await metadataFor("dune");

    expect(metadata.title).toBe("“dune” · Search");
    expect(metadata.description).toBe(DESCRIPTION);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toMatchObject({
      title: "Search",
      description: DESCRIPTION,
      type: "website",
      locale: "en_US",
      images: [`${ORIGIN}/opengraph-image`],
    });
    expect(metadata.twitter).toEqual({
      card: "summary_large_image",
      title: "Search",
      description: DESCRIPTION,
      images: [`${ORIGIN}/opengraph-image`],
    });
  });

  it("keeps the query out of the description and every URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    const metadata = await metadataFor("secret query");
    const { title, ...rest } = metadata;

    expect(title).toBe("“secret query” · Search");
    expect(JSON.stringify(rest)).not.toContain("secret");
  });

  it.each([
    [undefined],
    ["   "],
    [["a", "b"]],
    ["x".repeat(MAX_QUERY_LENGTH + 1)],
  ])("titles itself plain Search for the query %j", async (q) => {
    const metadata = await metadataFor(q);

    expect(metadata.title).toBe("Search");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("carries no image when there is no site URL (AC-11)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);

    const metadata = await metadataFor("dune");

    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter?.images).toBeUndefined();
  });
});
