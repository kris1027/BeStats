import { describe, expect, it } from "vitest";

import {
  ADAPTIVE_UNITS,
  barGroupHeight,
  barGroupWidth,
  barLayout,
  brandMarkSvg,
  finalLockupScale,
  ICON_BARS,
  ICON_UNITS,
  LAUNCH_BARS,
  LAUNCH_TIMELINE,
  LAUNCH_TOTAL_MS,
  SPLASH_IMAGE_POINTS,
} from "./mark";

/**
 * prompts/mobile-app-icon-launch.md, decisions 3, 6 and 7: the icon, the
 * splash image and the launch lockup share this geometry, so these pin it to
 * the design (option 3a) and to the platforms' icon rules.
 */
describe("brand mark", () => {
  it("draws the design's icon bars", () => {
    expect(barLayout(ICON_BARS)).toEqual([
      { x: 0, width: 15, height: 26, radius: 4 },
      { x: 24, width: 15, height: 43, radius: 4 },
      { x: 48, width: 15, height: 64, radius: 4 },
    ]);
    expect(barGroupWidth(ICON_BARS)).toBe(63);
  });

  it("keeps the adaptive icon inside Android's 66 dp safe circle", () => {
    // The safe circle is 66 of the layer's 108 dp; the bar group's diagonal
    // must fit inside it.
    const w = barGroupWidth(ICON_BARS) / ADAPTIVE_UNITS;
    const h = barGroupHeight(ICON_BARS) / ADAPTIVE_UNITS;
    expect(Math.hypot(w, h)).toBeLessThan(66 / 108);
  });

  it("scales the launch bars from the design's 300 px phone by 4/3", () => {
    expect(LAUNCH_BARS.heights).toEqual([16, 80 / 3, 40]);
    expect(SPLASH_IMAGE_POINTS).toBe(40);
    expect(barGroupWidth(LAUNCH_BARS)).toBeLessThanOrEqual(SPLASH_IMAGE_POINTS);
  });

  it("caps the final lockup at 1.3x and 230/300 of the screen", () => {
    expect(finalLockupScale(200, 402)).toBeCloseTo(1.3);
    expect(finalLockupScale(300, 320)).toBeCloseTo((230 / 300) * (320 / 300));
    expect(finalLockupScale(0, 320)).toBe(1.3);
  });

  it("finishes the words before the app fades in", () => {
    const { stats, be, app, lockup } = LAUNCH_TIMELINE;
    expect(be.delay).toBeLessThan(stats.delay);
    expect(stats.delay + stats.duration).toBeLessThanOrEqual(app.delay);
    expect(lockup.delay + lockup.duration).toBeLessThanOrEqual(app.delay);
    expect(LAUNCH_TOTAL_MS).toBe(2820);
  });

  it("renders a centred, square SVG", () => {
    const svg = brandMarkSvg({
      size: 1024,
      mark: "m",
      background: "b",
      variant: "icon",
    });
    expect(svg).toContain(`viewBox="0 0 ${ICON_UNITS} ${ICON_UNITS}"`);
    expect(svg).toContain('width="1024" height="1024"');
    // Centred: (120 - 63) / 2 from the left, (120 + 64) / 2 the bottom.
    expect(svg).toContain('<rect x="28.5" y="66" width="15" height="26"');
    expect(svg).toContain('fill="b"');
    const splash = brandMarkSvg({ size: 120, mark: "m", variant: "splash" });
    expect(splash).not.toContain('fill="b"');
    expect(splash).toContain(`viewBox="0 0 40 40"`);
  });
});
