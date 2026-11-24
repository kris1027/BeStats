/**
 * iOS's largest standard text size (XXXL); every accessibility size scales
 * text past it. Android's font scale steps cross it at its largest sizes too.
 */
const LARGEST_STANDARD_FONT_SCALE = 1.35;

/**
 * True at the accessibility text sizes, where a row of a title and a link
 * no longer fits a phone width, so the screen stacks it instead of letting
 * the title break inside its words (AGENTS.md section 3, phone width;
 * prompts/mobile-large-text-titles.md, decision 1). Takes
 * `useWindowDimensions().fontScale`, which follows the setting live.
 */
export function isAccessibilityTextSize(fontScale: number): boolean {
  return fontScale > LARGEST_STANDARD_FONT_SCALE;
}

/**
 * The most a poster card's title and year grow with the system text size:
 * the largest standard size, so they never take an accessibility size. The
 * card's width is fixed by its poster (112 to 150 points), so past this a
 * word like "Supernatural" no longer fits a grid column and breaks inside
 * itself; like a fixed height control, the card caps its text instead
 * (apps/mobile/AGENTS.md, Styling; prompts/mobile-large-text-titles.md,
 * decision 2).
 */
export const CARD_FONT_SCALE_CAP = LARGEST_STANDARD_FONT_SCALE;
