import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * covers: AC-13
 *
 * The sticky navbar hides an anchored heading unless the root element carries
 * enough `scroll-padding-top` to clear it. That relationship spans two files:
 * the height comes out of `Navbar`'s own layout, the padding is set here on
 * `<html>`. Nothing in the type system ties them together, so the pair drifts
 * silently, and it drifts at one breakpoint at a time.
 *
 * That is how this shipped broken: a single `scroll-pt-24` was sized for the
 * one row desktop bar, and nobody re-measured after the bar grew to two rows
 * below `md`. A fragment link put the heading 36px underneath it on every
 * phone, while desktop stayed correct, so the bug was invisible to anyone
 * testing at one width.
 *
 * jsdom cannot lay the navbar out, so this asserts the invariant against
 * heights measured in a real browser instead. If `Navbar`'s layout changes,
 * re-measure and update `NAVBAR_HEIGHTS`; that edit is the point, because it
 * forces the scroll padding to be reconsidered at the same time.
 */

/**
 * The rendered navbar height at each breakpoint, in pixels, measured in
 * Chromium on `/showcase` at widths from 320 to 1440.
 *
 * Below `md` the bar stacks: `py-3` (24) + the brand and sign in row (44) +
 * `gap-3` (12) + the media type tabs (51). At `md` and above it is one row:
 * `py-2.5` (20) + the tallest child (51).
 */
const NAVBAR_HEIGHTS = { base: 132, md: 72 };

/** Tailwind's default spacing step, so `scroll-pt-36` is 36 * 4 = 144px. */
const SPACING_PX = 4;

const LAYOUT = readFileSync("app/layout.tsx", "utf8");

/** The `scroll-pt-*` value for a breakpoint, in pixels. */
function scrollPaddingAt(breakpoint: "base" | "md"): number {
  const pattern =
    breakpoint === "base" ? /(?<![a-z:])scroll-pt-(\d+)/ : /md:scroll-pt-(\d+)/;
  const match = LAYOUT.match(pattern);

  if (!match) {
    throw new Error(
      `no ${breakpoint} scroll-pt-* class found in app/layout.tsx`,
    );
  }

  return Number(match[1]) * SPACING_PX;
}

describe("anchored headings clear the sticky navbar (AC-13)", () => {
  it("declares a scroll padding for both navbar layouts, not one for both", () => {
    expect(LAYOUT).toMatch(/(?<![a-z:])scroll-pt-\d+/);
    expect(LAYOUT).toMatch(/md:scroll-pt-\d+/);
  });

  it.each([
    ["base", NAVBAR_HEIGHTS.base],
    ["md", NAVBAR_HEIGHTS.md],
  ] as const)(
    "clears the %s navbar, which is %ipx tall",
    (breakpoint, navbarHeight) => {
      expect(scrollPaddingAt(breakpoint)).toBeGreaterThanOrEqual(navbarHeight);
    },
  );

  it("keeps the stacked navbar's padding the larger of the two", () => {
    expect(scrollPaddingAt("base")).toBeGreaterThan(scrollPaddingAt("md"));
  });
});
