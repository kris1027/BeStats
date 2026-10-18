import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageBackgroundMotion } from "./page-background-motion";

/**
 * covers: prompts/warm-page-background.md, AC-3, AC-4, AC-5
 *
 * The background moves only when motion is allowed, leans only toward a
 * mouse, keeps its stripes within one period, puts every layer back under
 * reduced motion, and stops on unmount. `matchMedia` and
 * `requestAnimationFrame` are driven by hand.
 */
let reduced = false;
const listeners = new Set<() => void>();
let frames: FrameRequestCallback[] = [];
let now = 0;

beforeEach(() => {
  reduced = false;
  frames = [];
  now = 0;
  listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("reduced-motion") ? reduced : false;
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = () => {};
  });
});

afterEach(() => vi.unstubAllGlobals());

function runFrames(count = 1, step = 1000) {
  for (let i = 0; i < count; i += 1) {
    const pending = frames;
    frames = [];
    now += step;
    for (const callback of pending) callback(now);
  }
}

function setup() {
  return render(
    <PageBackgroundMotion>
      <div data-page-bg="" data-testid="gradient" />
      <div data-page-blob="0.2,4,2" data-testid="blob" />
      <div data-page-stripes="" data-testid="stripes" />
    </PageBackgroundMotion>,
  );
}

function point(pointerType: string, clientX: number, clientY: number) {
  const event = new Event("pointermove") as PointerEvent;
  Object.assign(event, { pointerType, clientX, clientY });
  window.dispatchEvent(event);
}

/** The x offset a `translate3d(x, y, 0)` transform writes. */
function offsetX(node: HTMLElement): number {
  return Number(node.style.transform.match(/translate3d\((-?[\d.e-]+)px/)?.[1]);
}

describe("PageBackgroundMotion", () => {
  it("is hidden from assistive technology", () => {
    const { container } = setup();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("drifts the blobs over time with no input", () => {
    const { getByTestId } = setup();

    runFrames();
    const first = getByTestId("blob").style.transform;
    runFrames();

    expect(first).toContain("scale(");
    expect(getByTestId("blob").style.transform).not.toBe(first);
    expect(getByTestId("gradient").style.transform).toContain("translate3d");
  });

  it("leans away from a mouse, but not from touch", () => {
    const { getByTestId } = setup();
    runFrames();
    const rest = offsetX(getByTestId("gradient"));

    point("touch", window.innerWidth, 0);
    runFrames(5);
    expect(offsetX(getByTestId("gradient"))).toBeCloseTo(rest);

    point("mouse", window.innerWidth, 0);
    runFrames(5);
    expect(offsetX(getByTestId("gradient"))).toBeLessThan(rest);
  });

  it("keeps the stripes within one period, so their edge never shows", () => {
    const { getByTestId } = setup();
    vi.stubGlobal("scrollY", 123_456);
    point("mouse", window.innerWidth, 0);
    runFrames(60);

    const [x, y] = [
      ...getByTestId("stripes").style.transform.matchAll(/(-?[\d.e-]+)px/g),
    ].map(([, value]) => Math.abs(Number(value)));
    expect(x).toBeLessThan(14 * Math.SQRT2);
    expect(y).toBeLessThan(14 * Math.SQRT2);
  });

  it("writes nothing under reduced motion", () => {
    reduced = true;
    const { getByTestId } = setup();

    expect(frames).toHaveLength(0);
    expect(getByTestId("blob").style.transform).toBe("");
  });

  it("puts every layer back when reduced motion turns on", () => {
    const { getByTestId } = setup();
    runFrames();

    reduced = true;
    for (const listener of listeners) listener();
    runFrames();

    for (const id of ["gradient", "blob", "stripes"]) {
      expect(getByTestId(id).style.transform).toBe("");
    }
  });

  it("stops its loop and listeners on unmount", () => {
    const { unmount } = setup();
    unmount();

    expect(listeners.size).toBe(0);
    const pending = frames.length;
    runFrames();
    expect(frames.length).toBeLessThanOrEqual(pending);
  });
});
