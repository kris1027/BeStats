import { describe, expect, it, vi } from "vitest";

import { createLoop, MAX_STEP_SECONDS } from "./loop";
import type { BackdropRenderer, FrameState } from "./renderer";

/** A renderer that records frames, and a scheduler the test steps by hand. */
function harness({ reducedMotion = false, visible = true } = {}) {
  const frames: FrameState[] = [];
  const renderer: BackdropRenderer = {
    draw: (frame) => frames.push({ ...frame }),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  let pending: ((now: number) => void) | null = null;
  const scheduler = {
    request: vi.fn((callback: (now: number) => void) => {
      pending = callback;
      return 1;
    }),
    cancel: vi.fn(() => {
      pending = null;
    }),
  };
  const onFirstFrame = vi.fn();
  const loop = createLoop({
    renderer,
    scheduler,
    reducedMotion,
    visible,
    onFirstFrame,
  });
  const step = (now: number) => {
    const callback = pending;
    pending = null;
    callback?.(now);
  };
  return {
    loop,
    frames,
    renderer,
    scheduler,
    onFirstFrame,
    step,
    pending: () => pending,
  };
}

/** covers: prompts/ambient-background.md, AC-5, AC-6 */
describe("the background clock", () => {
  it("does nothing until it has a size", () => {
    const h = harness();
    expect(h.scheduler.request).not.toHaveBeenCalled();
    h.loop.resize(100, 100, 1);
    expect(h.scheduler.request).toHaveBeenCalledTimes(1);
  });

  it("advances by real elapsed time, capped per frame", () => {
    const h = harness();
    h.loop.resize(100, 100, 1);
    h.step(1000);
    h.step(1016);
    h.step(3000);
    expect(h.frames.map((f) => f.time)).toEqual([
      0,
      0.016,
      0.016 + MAX_STEP_SECONDS,
    ]);
    expect(h.onFirstFrame).toHaveBeenCalledTimes(1);
  });

  it("requests no frames while hidden and resumes without a jump", () => {
    const h = harness();
    h.loop.resize(100, 100, 1);
    h.step(0);
    h.step(16);
    h.loop.setVisible(false);
    expect(h.pending()).toBeNull();
    expect(h.scheduler.cancel).toHaveBeenCalled();

    h.loop.setVisible(true);
    h.step(60_000);
    h.step(60_016);
    const times = h.frames.map((f) => f.time);
    expect(times.at(-2)).toBeCloseTo(0.016);
    expect(times.at(-1)).toBeCloseTo(0.032);
  });

  it("draws one still frame under reduced motion, centred", () => {
    const h = harness({ reducedMotion: true });
    h.loop.setPointer(0.5, 0.5);
    h.loop.resize(100, 100, 1);
    expect(h.frames).toEqual([{ time: 0, pointerX: 0, pointerY: 0 }]);
    expect(h.pending()).toBeNull();

    // A resize clears the canvas, so the still frame is drawn again.
    h.loop.resize(200, 100, 1);
    expect(h.frames).toHaveLength(2);
    expect(h.pending()).toBeNull();
  });

  it("stops when reduced motion turns on and starts when it turns off", () => {
    const h = harness();
    h.loop.resize(100, 100, 1);
    h.step(0);
    h.loop.setReducedMotion(true);
    expect(h.pending()).toBeNull();
    h.loop.setReducedMotion(false);
    expect(h.pending()).not.toBeNull();
  });

  it("eases the camera toward the pointer", () => {
    const h = harness();
    h.loop.resize(100, 100, 1);
    h.loop.setPointer(0.5, -0.5);
    h.step(0);
    for (let now = 16; now < 5000; now += 16) h.step(now);
    const last = h.frames.at(-1);
    expect(last?.pointerX).toBeCloseTo(0.5, 2);
    expect(last?.pointerY).toBeCloseTo(-0.5, 2);
  });

  it("disposes the renderer once and never draws again", () => {
    const h = harness();
    h.loop.resize(100, 100, 1);
    h.loop.dispose();
    h.loop.dispose();
    h.loop.resize(10, 10, 1);
    h.loop.setVisible(true);
    expect(h.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(h.pending()).toBeNull();
    expect(h.frames).toHaveLength(0);
  });
});
