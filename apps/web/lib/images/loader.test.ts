import { describe, expect, it } from "vitest";

import { IGDB_IMAGE_BASE } from "@/lib/igdb/constants";
import { TMDB_IMAGE_BASE } from "@/lib/tmdb/constants";

import imageLoader from "./loader";

/**
 * covers: spec 0025, AC-11
 *
 * The one `loaderFile`: each host goes to its own loader, and anything else
 * comes back as given, so no URL is ever rewritten onto a host it was not on.
 */
describe("imageLoader", () => {
  it("sends a TMDB URL to the TMDB loader", () => {
    expect(
      imageLoader({ src: `${TMDB_IMAGE_BASE}/w500/abc.jpg`, width: 200 }),
    ).toBe(`${TMDB_IMAGE_BASE}/w300/abc.jpg`);
  });

  it("sends an IGDB URL to the IGDB loader", () => {
    expect(
      imageLoader({
        src: `${IGDB_IMAGE_BASE}/t_cover_big_2x/co1.jpg`,
        width: 200,
      }),
    ).toBe(`${IGDB_IMAGE_BASE}/t_cover_big/co1.jpg`);
  });

  it("passes an IGDB #same-size input through the IGDB loader", () => {
    expect(
      imageLoader({
        src: `${IGDB_IMAGE_BASE}/t_cover_big/co1.jpg#same-size`,
        width: 1000,
      }),
    ).toBe(`${IGDB_IMAGE_BASE}/t_cover_big/co1.jpg#same-size`);
  });

  it.each([
    "/tmdb-logo.svg",
    "https://example.com/t/p/w500/abc.jpg",
    "https://image.tmdb.org.evil.example/t/p/w500/abc.jpg",
  ])("returns %s unchanged", (src) => {
    expect(imageLoader({ src, width: 200 })).toBe(src);
  });
});
