import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0021, AC-15
 *
 * The landings are one page each now, so their metadata is static: the
 * catalog title, the AC-15 description, and the bare path as canonical. The
 * module is imported after the site URL is stubbed, because the metadata is
 * built when the module loads.
 */
const ORIGIN = "https://bestats.example";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function landingMetadataOf(path: "./page" | "../shows/page") {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  return (await import(path)).metadata;
}

describe("the landings' metadata (AC-15)", () => {
  it("gives /movies its title, description and bare canonical", async () => {
    const metadata = await landingMetadataOf("./page");

    expect(metadata.title).toBe("Movies");
    expect(metadata.description).toBe(
      "Browse trending, popular, now playing, upcoming and top rated movies on BeStats, and keep track of what you watch.",
    );
    expect(metadata.alternates).toEqual({ canonical: `${ORIGIN}/movies` });
    expect(metadata.robots).toBeUndefined();
  });

  it("gives /shows its title, description and bare canonical", async () => {
    const metadata = await landingMetadataOf("../shows/page");

    expect(metadata.title).toBe("Shows");
    expect(metadata.description).toBe(
      "Browse trending, popular, airing and top rated TV shows on BeStats, and keep track of what you watch.",
    );
    expect(metadata.alternates).toEqual({ canonical: `${ORIGIN}/shows` });
  });
});
