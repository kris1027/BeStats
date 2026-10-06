import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LAYOUT = readFileSync("app/layout.tsx", "utf8");

/**
 * covers: AC-13
 *
 * The navbar used to be sticky, and `<html>` carried a responsive
 * `scroll-padding-top` so an anchored heading cleared it. The bar now scrolls
 * away with the page, so that padding would only push every fragment target
 * down by a bar that is no longer there. This fails if it comes back without
 * the bar becoming sticky again.
 */
describe("anchored headings with a non sticky navbar (AC-13)", () => {
  it("adds no scroll padding to the root element", () => {
    expect(LAYOUT).not.toMatch(/scroll-pt-|scroll-padding/);
  });
});

/**
 * covers: spec 0017, AC-1, AC-5
 *
 * The footer is TMDB's attribution, so it has to render once on every route,
 * which means once in the root layout, after the content and before the toast
 * region. `<main>` keeps `flex-1`, which is what pins the footer to the bottom
 * of a short page (sign in, the 404).
 */
describe("the site footer in the root layout", () => {
  it("renders exactly once, between </main> and <Toaster />", () => {
    expect(LAYOUT.match(/<SiteFooter\s*\/>/g)).toHaveLength(1);
    const main = LAYOUT.indexOf("</main>");
    const footer = LAYOUT.indexOf("<SiteFooter");
    const toaster = LAYOUT.indexOf("<Toaster");
    expect(main).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(main);
    expect(toaster).toBeGreaterThan(footer);
  });

  it("keeps flex-1 on <main> so short pages push the footer down", () => {
    expect(LAYOUT).toMatch(/<main className="[^"]*\bflex-1\b[^"]*"/);
  });
});
