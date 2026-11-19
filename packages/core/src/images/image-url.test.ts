import { describe, expect, it } from "vitest";

import { IGDB_IMAGE_BASE } from "../igdb/constants";
import { TMDB_IMAGE_BASE } from "../tmdb/images";
import { imageUrlForWidth, sizeImageUrl } from "./image-url";

/**
 * covers: spec 0035, Images (settled 2026-11-19)
 *
 * The web's `next/image` loader and the phone pick sizes here, so a wrong rung
 * is a heavier image than the field allows on both apps at once. The web's
 * `lib/images/*-sizes.test.ts` keep the full ladders; these pin the shared
 * contract: never above the source, unknown URLs untouched.
 */
const tmdb = (size: string) => `${TMDB_IMAGE_BASE}/${size}/abc.jpg`;
const igdb = (size: string) => `${IGDB_IMAGE_BASE}/${size}/co1.jpg`;

describe("sizeImageUrl", () => {
  it.each([
    [tmdb("w500"), 100, tmdb("w154")],
    [tmdb("w500"), 342, tmdb("w342")],
    [tmdb("w500"), 1200, tmdb("w500")],
    [tmdb("w1280"), 640, tmdb("w780")],
    [tmdb("original"), 1080, tmdb("w1280")],
    [tmdb("original"), 2000, tmdb("original")],
    [igdb("t_cover_big_2x"), 200, igdb("t_cover_big")],
    [igdb("t_cover_big_2x"), 2000, igdb("t_cover_big_2x")],
    [igdb("t_1080p"), 600, igdb("t_screenshot_big")],
  ])("sizes %s at width %i to %s", (url, width, expected) => {
    expect(sizeImageUrl(url, width)).toBe(expected);
  });

  it.each([
    tmdb("h632"),
    `${TMDB_IMAGE_BASE}/abc.jpg`,
    igdb("t_thumb"),
    "https://example.com/t/p/w500/abc.jpg",
    "/tmdb-logo.svg",
  ])("returns null for %s, which it did not build", (url) => {
    expect(sizeImageUrl(url, 200)).toBeNull();
  });
});

describe("imageUrlForWidth", () => {
  it("steps a known URL down", () => {
    expect(imageUrlForWidth(tmdb("w500"), 300)).toBe(tmdb("w300"));
  });

  it("returns an unknown URL unchanged", () => {
    const url = "https://example.com/poster.jpg";
    expect(imageUrlForWidth(url, 300)).toBe(url);
  });
});
