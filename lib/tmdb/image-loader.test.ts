import { describe, expect, it } from "vitest";

import { TMDB_IMAGE_BASE } from "./constants";
import tmdbImageLoaderDefault, { tmdbImageLoader } from "./image-loader";

/**
 * covers: prompts/tmdb-image-loader.md, AC-1 to AC-3
 *
 * The loader is what keeps Vercel Image Optimization at zero transformations,
 * so a wrong rung is either a broken TMDB URL (a 400 for `w640`) or a heavier
 * image than the field size allows. Both are invisible until someone looks.
 */
const at = (size: string) => `${TMDB_IMAGE_BASE}/${size}/abc123.jpg`;

describe("tmdbImageLoader", () => {
  it("is the module's default export, which loaderFile needs", () => {
    expect(tmdbImageLoaderDefault).toBe(tmdbImageLoader);
  });

  it.each([
    [32, "w92"],
    [92, "w92"],
    [93, "w154"],
    [200, "w300"],
    [342, "w342"],
    [384, "w500"],
    [3840, "w500"],
  ])("serves a w500 poster at width %i from %s (AC-1)", (width, size) => {
    expect(tmdbImageLoader({ src: at("w500"), width, quality: 75 })).toBe(
      at(size),
    );
  });

  it.each([
    [640, "w780"],
    [828, "w1280"],
    [3840, "w1280"],
  ])("serves a w1280 backdrop at width %i from %s (AC-2)", (width, size) => {
    expect(tmdbImageLoader({ src: at("w1280"), width })).toBe(at(size));
  });

  it("never asks for more than the pinned profile size", () => {
    expect(tmdbImageLoader({ src: at("w185"), width: 384 })).toBe(at("w185"));
  });

  it("caps an original source at w1280 and still sizes it down (AC-3)", () => {
    expect(tmdbImageLoader({ src: at("original"), width: 3840 })).toBe(
      at("w1280"),
    );
    expect(tmdbImageLoader({ src: at("original"), width: 128 })).toBe(
      at("w154"),
    );
  });

  it.each([
    at("h632"),
    at("w45"),
    `${TMDB_IMAGE_BASE}/abc123.jpg`,
    "https://example.com/t/p/w500/abc123.jpg",
    "/tmdb-logo.svg",
  ])("returns %s unchanged (AC-3)", (src) => {
    expect(tmdbImageLoader({ src, width: 200 })).toBe(src);
  });
});
