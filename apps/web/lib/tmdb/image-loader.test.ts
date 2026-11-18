import { describe, expect, it } from "vitest";

import { TMDB_IMAGE_BASE } from "./constants";
import { tmdbImageLoader } from "./image-loader";

/**
 * covers: prompts/tmdb-image-loader.md, AC-1 to AC-3
 *
 * The loader is what keeps Vercel Image Optimization at zero transformations,
 * so a wrong rung is either a broken TMDB URL (a 400 for `w640`) or a heavier
 * image than the field size allows. Both are invisible until someone looks.
 */
const at = (size: string) => `${TMDB_IMAGE_BASE}/${size}/abc123.jpg`;
/** The source's own size comes back marked, so Next sees the width honoured. */
const same = (size: string) => `${at(size)}#same-size`;

describe("tmdbImageLoader", () => {
  it.each([
    [32, "w92"],
    [92, "w92"],
    [93, "w154"],
    [200, "w300"],
    [342, "w342"],
  ])("serves a w500 poster at width %i from %s (AC-1)", (width, size) => {
    expect(tmdbImageLoader({ src: at("w500"), width, quality: 75 })).toBe(
      at(size),
    );
  });

  it.each([384, 3840])(
    "serves a w500 poster at width %i from its own size, marked so Next does not warn",
    (width) => {
      expect(tmdbImageLoader({ src: at("w500"), width })).toBe(same("w500"));
    },
  );

  it.each([[640, "w780"]])(
    "serves a w1280 backdrop at width %i from %s (AC-2)",
    (width, size) => {
      expect(tmdbImageLoader({ src: at("w1280"), width })).toBe(at(size));
    },
  );

  it("serves a w1280 backdrop from its own size above w780 (AC-2)", () => {
    expect(tmdbImageLoader({ src: at("w1280"), width: 828 })).toBe(
      same("w1280"),
    );
  });

  it("never asks for more than the pinned profile size", () => {
    expect(tmdbImageLoader({ src: at("w185"), width: 384 })).toBe(same("w185"));
  });

  it.each([1281, 1920, 3840])(
    "serves an original source whole at width %i, past the top rung (prompts/home-hero-backdrop-quality.md, AC-2)",
    (width) => {
      expect(tmdbImageLoader({ src: at("original"), width })).toBe(
        same("original"),
      );
    },
  );

  it.each([
    [128, "w154"],
    [1080, "w1280"],
    [1280, "w1280"],
  ])(
    "sizes an original source down the ladder at width %i to %s (AC-3)",
    (width, size) => {
      expect(tmdbImageLoader({ src: at("original"), width })).toBe(at(size));
    },
  );

  it.each([
    at("h632"),
    at("w45"),
    `${TMDB_IMAGE_BASE}/abc123.jpg`,
    "https://example.com/t/p/w500/abc123.jpg",
    "/tmdb-logo.svg",
  ])(
    "returns %s unchanged, leaving Next's width warning to flag it (AC-3)",
    (src) => {
      expect(tmdbImageLoader({ src, width: 200 })).toBe(src);
    },
  );
});
