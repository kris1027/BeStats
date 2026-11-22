/**
 * covers: spec 0035 (Images: a slot loads the smallest catalog size that is
 * sharp at the device's density, never a larger one than the API sent).
 */
import { PixelRatio } from "react-native";

import { sizedImageUri } from "./images";

const TMDB = "https://image.tmdb.org/t/p";

let ratio: jest.SpyInstance;

beforeEach(() => {
  ratio = jest.spyOn(PixelRatio, "get");
});

afterEach(() => {
  ratio.mockRestore();
});

describe("sizedImageUri", () => {
  test("a small tile on a 1x screen steps a w500 poster down", () => {
    ratio.mockReturnValue(1);
    expect(sizedImageUri(`${TMDB}/w500/abc.jpg`, 90)).toBe(
      `${TMDB}/w92/abc.jpg`,
    );
  });

  test("the same tile on a 3x screen asks for more pixels", () => {
    ratio.mockReturnValue(3);
    expect(sizedImageUri(`${TMDB}/w500/abc.jpg`, 90)).toBe(
      `${TMDB}/w300/abc.jpg`,
    );
  });

  test("never sizes past the URL's own ceiling", () => {
    ratio.mockReturnValue(3);
    expect(sizedImageUri(`${TMDB}/w185/abc.jpg`, 300)).toBe(
      `${TMDB}/w185/abc.jpg`,
    );
  });

  test("rounds a fractional pixel width up so the image is never soft", () => {
    // 62 points at 1.5x is 93 pixels, one more than w92 holds.
    ratio.mockReturnValue(1.5);
    expect(sizedImageUri(`${TMDB}/w500/abc.jpg`, 62)).toBe(
      `${TMDB}/w154/abc.jpg`,
    );
  });

  test("leaves a URL from an unknown host untouched", () => {
    ratio.mockReturnValue(2);
    const url = "https://example.com/poster.jpg";
    expect(sizedImageUri(url, 100)).toBe(url);
  });
});
