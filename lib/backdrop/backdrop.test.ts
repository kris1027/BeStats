import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackdropRenderer } from "./renderer";

const { createRenderer } = vi.hoisted(() => ({
  createRenderer: vi.fn<() => BackdropRenderer | null>(),
}));
vi.mock("./renderer", () => ({ createRenderer }));

import { type BackdropOptions, createBackdrop } from "./backdrop";

const rgb: [number, number, number] = [0, 0, 0];

function options(): BackdropOptions {
  return {
    width: 100,
    height: 100,
    budget: {
      gridWidth: 1,
      gridDepth: 1,
      spacing: 1,
      panels: 1,
      dust: 1,
      pixelRatio: 1,
    },
    colors: { accent: rgb, background: rgb, wave: rgb, dust: rgb, text: rgb },
    // A still frame keeps the loop from scheduling anything.
    reducedMotion: true,
    visible: true,
    onReady: vi.fn(),
    onLost: vi.fn(),
  };
}

function renderer(): BackdropRenderer {
  return { draw: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
}

/** Only the event target half of a canvas is used once the renderer exists. */
const canvas = () => new EventTarget() as unknown as OffscreenCanvas;

/** covers: prompts/ambient-background.md, AC-7 */
describe("createBackdrop", () => {
  beforeEach(() => {
    createRenderer.mockReset();
  });

  it("draws nothing without WebGL2", () => {
    createRenderer.mockReturnValue(null);
    expect(createBackdrop(canvas(), options())).toBeNull();
  });

  it("draws nothing when a shader fails to link", () => {
    createRenderer.mockImplementation(() => {
      throw new Error("backdrop: shader program failed to link");
    });
    expect(createBackdrop(canvas(), options())).toBeNull();
  });

  it("reports a lost context and stops drawing", () => {
    const scene = renderer();
    createRenderer.mockReturnValue(scene);
    const target = canvas();
    const opts = options();
    createBackdrop(target, opts);
    (target as unknown as EventTarget).dispatchEvent(
      new Event("webglcontextlost"),
    );
    expect(opts.onLost).toHaveBeenCalledTimes(1);
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not report its own release of the context as a loss", () => {
    createRenderer.mockReturnValue(renderer());
    const target = canvas();
    const opts = options();
    createBackdrop(target, opts)?.dispose();
    (target as unknown as EventTarget).dispatchEvent(
      new Event("webglcontextlost"),
    );
    expect(opts.onLost).not.toHaveBeenCalled();
  });
});
