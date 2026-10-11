import { describe, expect, it, vi } from "vitest";

import { createClock, MAX_STEP_SECONDS, SCENE_SPEED } from "./clock";
import type { FrameState, SceneRenderer } from "./scene";

/** A renderer that records frames, and a scheduler the test steps by hand. */
function harness({ reducedMotion = false, visible = true } = {}) {
  const frames: FrameState[] = [];
  const renderer: SceneRenderer = {
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
  const clock = createClock({
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
    clock,
    frames,
    renderer,
    scheduler,
    onFirstFrame,
    step,
    pending: () => pending,
  };
}

/** covers: prompts/film-strip-background.md, AC-6, AC-7 */
describe("the scene clock", () => {
  it("does nothing until it has a size", () => {
    const h = harness();
    expect(h.scheduler.request).not.toHaveBeenCalled();
    h.clock.resize(100, 100, 1);
    expect(h.scheduler.request).toHaveBeenCalledTimes(1);
  });

  it("advances by real elapsed time, capped per frame", () => {
    const h = harness();
    h.clock.resize(100, 100, 1);
    h.step(1000);
    h.step(1016);
    h.step(3000);
    const times = h.frames.map((f) => f.time);
    expect(times[0]).toBe(0);
    expect(times[1]).toBeCloseTo(0.016 * SCENE_SPEED);
    expect(times[2]).toBeCloseTo((0.016 + MAX_STEP_SECONDS) * SCENE_SPEED);
    expect(h.onFirstFrame).toHaveBeenCalledTimes(1);
  });

  it("requests no frames while hidden and resumes without a jump", () => {
    const h = harness();
    h.clock.resize(100, 100, 1);
    h.step(0);
    h.step(16);
    h.clock.setVisible(false);
    expect(h.pending()).toBeNull();
    expect(h.scheduler.cancel).toHaveBeenCalled();

    h.clock.setVisible(true);
    h.step(60_000);
    h.step(60_016);
    const times = h.frames.map((f) => f.time);
    expect(times.at(-2)).toBeCloseTo(0.016 * SCENE_SPEED);
    expect(times.at(-1)).toBeCloseTo(0.032 * SCENE_SPEED);
  });

  it("draws one still frame under reduced motion", () => {
    const h = harness({ reducedMotion: true });
    h.clock.resize(100, 100, 1);
    expect(h.frames).toEqual([{ time: 0 }]);
    expect(h.pending()).toBeNull();

    // A resize clears the canvas, so the still frame is drawn again.
    h.clock.resize(200, 100, 1);
    expect(h.frames).toHaveLength(2);
    expect(h.pending()).toBeNull();
  });

  it("stops when reduced motion turns on and starts when it turns off", () => {
    const h = harness();
    h.clock.resize(100, 100, 1);
    h.step(0);
    h.clock.setReducedMotion(true);
    expect(h.pending()).toBeNull();
    h.clock.setReducedMotion(false);
    expect(h.pending()).not.toBeNull();
  });

  it("disposes the renderer once and never draws again", () => {
    const h = harness();
    h.clock.resize(100, 100, 1);
    h.clock.dispose();
    h.clock.dispose();
    h.clock.resize(10, 10, 1);
    h.clock.setVisible(true);
    expect(h.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(h.pending()).toBeNull();
    expect(h.frames).toHaveLength(0);
  });
});
