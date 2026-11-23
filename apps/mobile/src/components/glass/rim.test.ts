import { GLASS } from "@bestats/core/tokens.generated";

import { tokenColor } from "@/theme/token-vars";

import { RIM_WIDTH, rimRadius, svgStop } from "./rim";

describe("rimRadius", () => {
  it("keeps a small radius inside the stroke", () => {
    expect(rimRadius(12, 200, 100)).toBe(12 - RIM_WIDTH / 2);
  });

  it("caps a pill radius at half the shorter side, never an ellipse", () => {
    expect(rimRadius(9999, 300, 40)).toBe((40 - RIM_WIDTH) / 2);
  });

  it("never goes below zero", () => {
    expect(rimRadius(0, 10, 10)).toBe(0);
  });
});

describe("svgStop", () => {
  const [top, middle] = GLASS.gradients["glass-rim"].stops;

  it("moves the CSS alpha to the stop opacity", () => {
    expect(svgStop(top.color).opacity).toBeCloseTo(0.62);
    expect(svgStop(middle.color).opacity).toBeCloseTo(0.1);
    expect(svgStop(top.color).color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("parses every stop pnpm tokens writes", () => {
    for (const gradient of Object.values(GLASS.gradients)) {
      for (const stop of gradient.stops) {
        expect(svgStop(stop.color).color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("keeps an opaque hex colour whole", () => {
    const hex = tokenColor("color-page-top");
    expect(svgStop(hex)).toEqual({ color: hex, opacity: 1 });
  });
});
