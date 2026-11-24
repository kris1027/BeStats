import { CARD_FONT_SCALE_CAP, isAccessibilityTextSize } from "./font-scale";

/** covers: prompts/mobile-large-text-titles.md, decisions 1 and 2 */

test("standard text sizes, up to iOS's XXXL, keep the row layout", () => {
  expect(isAccessibilityTextSize(1)).toBe(false);
  expect(isAccessibilityTextSize(1.35)).toBe(false);
});

test("every accessibility text size stacks", () => {
  expect(isAccessibilityTextSize(1.65)).toBe(true);
  expect(isAccessibilityTextSize(3.12)).toBe(true);
});

test("card text grows up to the largest standard size, never past it", () => {
  expect(CARD_FONT_SCALE_CAP).toBeGreaterThan(1);
  expect(isAccessibilityTextSize(CARD_FONT_SCALE_CAP)).toBe(false);
});
