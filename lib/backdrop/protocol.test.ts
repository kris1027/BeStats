import { describe, expect, it } from "vitest";

import { toWorkerSchema } from "./protocol";

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
    { type: "pointer", x: 4, y: 0 },
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
    expect(
      toWorkerSchema.safeParse({
        type: "init",
        canvas: {},
        width: 10,
        height: 10,
        budget: {
          gridWidth: 1,
          gridDepth: 1,
          spacing: 1,
          panels: 1,
          dust: 1,
          pixelRatio: 1,
        },
        colors: { accent: rgb, background: rgb, wave: rgb, dust: rgb },
        reducedMotion: false,
        visible: true,
      }).success,
    ).toBe(false);
  });
});
