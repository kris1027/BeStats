import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneRenderer } from "./scene";

const { createScene } = vi.hoisted(() => ({
  createScene: vi.fn<() => SceneRenderer | null>(),
}));
vi.mock("./scene", () => ({ createScene }));

import { type RunOptions, runScene } from "./run";

const rgb: [number, number, number] = [0, 0, 0];

const palette = new Proxy({}, { get: () => rgb }) as RunOptions["palette"];

function options(): RunOptions {
  return {
    width: 100,
    height: 100,
    budget: { strips: 1, segments: 1, bokeh: 1, pixelRatio: 1 },
    palette,
    // A still frame keeps the loop from scheduling anything.
    reducedMotion: true,
    visible: true,
    onReady: vi.fn(),
    onLost: vi.fn(),
  };
}

function renderer(): SceneRenderer {
  return { draw: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
}

/** Only the event target half of a canvas is used once the renderer exists. */
const canvas = () => new EventTarget() as unknown as OffscreenCanvas;

/** covers: prompts/film-strip-background.md, AC-8 */
describe("runScene", () => {
  beforeEach(() => {
    createScene.mockReset();
  });

  it("draws nothing without WebGL2", () => {
    createScene.mockReturnValue(null);
    expect(runScene(canvas(), options())).toBeNull();
  });

  it("draws nothing when a shader fails to link", () => {
    createScene.mockImplementation(() => {
      throw new Error("film-scene: shader program failed to link");
    });
    expect(runScene(canvas(), options())).toBeNull();
  });

  it("reports a lost context and stops drawing", () => {
    const scene = renderer();
    createScene.mockReturnValue(scene);
    const target = canvas();
    const opts = options();
    runScene(target, opts);
    (target as unknown as EventTarget).dispatchEvent(
      new Event("webglcontextlost"),
    );
    expect(opts.onLost).toHaveBeenCalledTimes(1);
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not report its own release of the context as a loss", () => {
    createScene.mockReturnValue(renderer());
    const target = canvas();
    const opts = options();
    runScene(target, opts)?.dispose();
    (target as unknown as EventTarget).dispatchEvent(
      new Event("webglcontextlost"),
    );
    expect(opts.onLost).not.toHaveBeenCalled();
  });
});
