import { describe, expect, it } from "vitest";

import { catalogList, GAME_LIST_SLUGS } from "@/lib/catalog/lists";
import { gameListMetadata, gamesMetadata } from "./landing-metadata";

/**
 * covers: spec 0028, AC-13
 *
 * Games stay out of search engines until G10: `/games` and every games list
 * page is `noindex`, with no canonical and no share card of its own. The
 * metadata is static, so it holds for every `?page` and costs no IGDB read.
 */
describe("gamesMetadata", () => {
  it("keeps its title and description and marks the page noindex", () => {
    const metadata = gamesMetadata({
      title: "Games",
      description: "Browse games.",
    });

    expect(metadata).toEqual({
      title: "Games",
      description: "Browse games.",
      robots: { index: false },
    });
  });

  it("names no canonical and no share card", () => {
    const metadata = gamesMetadata({ title: "Games", description: "x" });

    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
    expect(metadata.twitter).toBeUndefined();
  });
});

describe("gameListMetadata", () => {
  it.each(GAME_LIST_SLUGS)(
    "titles %s with its h1 and note, noindex",
    (slug) => {
      const list = catalogList("game", slug);

      expect(gameListMetadata(list)).toEqual({
        title: list.heading,
        description: list.note,
        robots: { index: false },
      });
    },
  );

  it("returns metadata directly, not a promise, so it never reads IGDB", () => {
    const metadata = gameListMetadata(catalogList("game", "top-rated"));

    expect(metadata).not.toBeInstanceOf(Promise);
  });
});
