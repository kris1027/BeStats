import { describe, expect, it } from "vitest";

import { IGDB_IMAGE_BASE } from "@/lib/igdb/constants";

import { igdbImageLoader } from "./igdb-loader";

/**
 * covers: spec 0025, AC-12; spec 0028, AC-6; spec 0029, AC-16
 *
 * A wrong rung is either a heavier cover than the field needs or an upgrade
 * past the size the URL named; neither shows up until someone looks.
 */
const at = (size: string) => `${IGDB_IMAGE_BASE}/${size}/co1abc.jpg`;
const same = (size: string) => `${at(size)}#same-size`;
const art = (size: string) => `${IGDB_IMAGE_BASE}/${size}/ar1abc.jpg`;

describe("igdbImageLoader", () => {
  it.each([
    [50, "t_cover_small"],
    [90, "t_cover_small"],
    [200, "t_cover_big"],
    [264, "t_cover_big"],
    [480, "t_cover_big_2x"],
  ])("serves a 2x cover at width %i from %s", (width, size) => {
    const url = igdbImageLoader({ src: at("t_cover_big_2x"), width });
    expect(url.replace("#same-size", "")).toBe(at(size));
  });

  // spec 0029, AC-16: the quick search row's `sizes="42px"` cover. With
  // Next's default image widths the browser picks 48 at 1x, 96 at 2x and 128
  // at 3x, and each lands on a real cover rung well under the 2x ceiling.
  it.each([
    [48, "t_cover_small"],
    [96, "t_cover_small_2x"],
    [128, "t_cover_small_2x"],
  ])(
    "serves the 42px quick search cover at width %i from %s",
    (width, size) => {
      const url = igdbImageLoader({ src: at("t_cover_big_2x"), width });
      expect(url).toBe(at(size));
    },
  );

  it("marks the source's own size so Next sees the width honoured", () => {
    expect(igdbImageLoader({ src: at("t_cover_big_2x"), width: 1000 })).toBe(
      same("t_cover_big_2x"),
    );
    expect(igdbImageLoader({ src: at("t_cover_big_2x"), width: 480 })).toBe(
      same("t_cover_big_2x"),
    );
  });

  it("never goes past the size the URL names", () => {
    expect(igdbImageLoader({ src: at("t_cover_big"), width: 1000 })).toBe(
      same("t_cover_big"),
    );
    expect(igdbImageLoader({ src: at("t_cover_small"), width: 200 })).toBe(
      same("t_cover_small"),
    );
  });

  it("strips a #same-size fragment before reading the URL", () => {
    expect(igdbImageLoader({ src: same("t_cover_big_2x"), width: 50 })).toBe(
      at("t_cover_small"),
    );
  });

  // spec 0028, AC-6: art steps down its own ladder, never the cover one.
  it.each([
    [300, "t_screenshot_med"],
    [555, "t_screenshot_med"],
    [800, "t_screenshot_big"],
    [1200, "t_720p"],
    [1600, "t_1080p"],
  ])("serves 1080p art at width %i from %s", (width, size) => {
    const url = igdbImageLoader({ src: art("t_1080p"), width });
    expect(url.replace("#same-size", "")).toBe(art(size));
  });

  it("never steps art past the size the URL names", () => {
    expect(igdbImageLoader({ src: art("t_screenshot_big"), width: 1600 })).toBe(
      `${art("t_screenshot_big")}#same-size`,
    );
  });

  it.each([
    `${IGDB_IMAGE_BASE}/t_screenshot_huge/sc1.jpg`,
    `${IGDB_IMAGE_BASE}/t_cover_big/co1.png`,
    `${IGDB_IMAGE_BASE}/co1.jpg`,
    `${IGDB_IMAGE_BASE}/t_cover_big/a/co1.jpg`,
    "https://image.tmdb.org/t/p/w500/abc.jpg",
    "/tmdb-logo.svg",
  ])("returns %s unchanged", (src) => {
    expect(igdbImageLoader({ src, width: 100 })).toBe(src);
  });
});
