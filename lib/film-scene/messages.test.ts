import { describe, expect, it } from "vitest";

import { toWorkerSchema } from "./messages";

describe("worker messages", () => {
  it.each([
    { type: "resize", width: 1440, height: 900, pixelRatio: 1.5 },
    { type: "pointer", x: -0.5, y: 0.25 },
    { type: "visible", visible: false },
    { type: "motion", reduced: true },
  ])("accepts %o", (message) => {
    expect(toWorkerSchema.safeParse(message).success).toBe(true);
  });

  it.each([
    { type: "pointer", x: 0.8, y: 0 },
    { type: "resize", width: -1, height: 900, pixelRatio: 1 },
    { type: "resize", width: 1, height: 900, pixelRatio: 99 },
    { type: "visible", visible: "yes" },
    { type: "unknown" },
    { type: "dispose" },
    null,
    "dispose",
  ])("rejects %o", (message) => {
    expect(toWorkerSchema.safeParse(message).success).toBe(false);
  });

  it("rejects an init whose canvas is not an OffscreenCanvas", () => {
    const rgb = [0.1, 0.2, 0.3];
    const palette = Object.fromEntries(
      [
        "glow",
        "fog",
        "filmBase",
        "filmWindow",
        "filmShadow",
        "filmEdge",
        "filmRail",
        "filmGlow",
        "lightAmbient",
        "lightKey",
        "lightRim",
        "bokeh1",
        "bokeh2",
        "bokeh3",
        "bokeh4",
        "text",
      ].map((key) => [key, rgb]),
    );
    expect(
      toWorkerSchema.safeParse({
        type: "init",
        canvas: {},
        width: 10,
        height: 10,
        budget: { strips: 3, segments: 400, bokeh: 70, pixelRatio: 1 },
        palette,
        reducedMotion: false,
        visible: true,
      }).success,
    ).toBe(false);
  });
});
