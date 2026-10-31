import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LARGE, LandingParallax, WIDE } from "./landing-parallax";

/**
 * covers: prompts/home-parallax-landing.md, AC-7 (decisions 9 and 16);
 * prompts/mobile-landing-parallax.md, AC-1, AC-2, AC-5 and AC-6
 *
 * The motion layer writes transforms only when motion is allowed, puts every
 * node back when the visitor asks for reduced motion, and stops its loop on
 * unmount. `matchMedia` and `requestAnimationFrame` are driven by hand.
 */
let reduced = false;
let wide = true;
let large = false;
const listeners = new Set<() => void>();
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  reduced = false;
  wide = true;
  large = false;
  frames = [];
  listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      if (query.includes("reduced-motion")) return reduced;
      if (query === LARGE) return large;
      if (query === WIDE) return wide;
      return true;
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

/** The vertical offset a `translate3d(0, Ypx, 0)` writes. */
function offsetY(node: HTMLElement): number {
  return Number(/, (-?[\d.e-]+)px, 0\)$/.exec(node.style.transform)?.[1]);
}

function runFrame() {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
}

function setup() {
  return render(
    <LandingParallax>
      <div data-depth="0.5" data-testid="depth" />
      <div data-hero-bg="" data-testid="backdrop" />
      <div data-hero-fg="" data-testid="hero" />
      <ul data-speed-root="">
        <li data-speed="0.2" data-testid="speed" />
        <li data-speed="0" data-speed-lg="0.2" data-testid="speed-lg" />
        <li
          data-speed="0.2"
          data-speed-narrow="-0.2"
          data-testid="speed-narrow"
        />
      </ul>
    </LandingParallax>,
  );
}

describe("LandingParallax (AC-7)", () => {
  it("moves the marked nodes when motion is allowed", () => {
    const { getByTestId } = setup();

    runFrame();

    expect(getByTestId("depth").style.transform).toContain("translate3d");
    expect(getByTestId("hero").style.opacity).toBe("1");
    expect(getByTestId("speed").style.transform).toContain("translate3d");
  });

  it("drifts the hero backdrop without zooming it (prompts/home-hero-backdrop-quality.md, AC-1)", () => {
    const { getByTestId } = setup();

    runFrame();

    const transform = getByTestId("backdrop").style.transform;
    expect(transform).toContain("translate3d");
    expect(transform).not.toContain("scale");
  });

  it("uses data-speed-lg only from lg (prompts/top-rated-parallax-columns.md, decision 3)", () => {
    const below = setup();
    runFrame();
    expect(below.getByTestId("speed-lg").style.transform).toBe(
      "translate3d(0, 0px, 0)",
    );
    below.unmount();

    large = true;
    const above = setup();
    runFrame();
    expect(above.getByTestId("speed-lg").style.transform).toBe(
      above.getByTestId("speed").style.transform,
    );
  });

  it("drifts below md too, scaled to the screen (prompts/mobile-landing-parallax.md, AC-1)", () => {
    const desktop = setup();
    runFrame();
    const full = offsetY(desktop.getByTestId("speed"));
    desktop.unmount();

    wide = false;
    vi.stubGlobal("innerWidth", 390);
    const { getByTestId } = setup();
    runFrame();

    expect(full).not.toBe(0);
    expect(offsetY(getByTestId("speed"))).toBeCloseTo(full * (390 / 1024));
    expect(getByTestId("depth").style.transform).toContain("translate3d");
  });

  it("keeps full strength from md at any width (prompts/mobile-landing-parallax.md, AC-2)", () => {
    vi.stubGlobal("innerWidth", 1024);
    const reference = setup();
    runFrame();
    const full = offsetY(reference.getByTestId("speed"));
    reference.unmount();

    vi.stubGlobal("innerWidth", 768);
    const { getByTestId } = setup();
    runFrame();

    expect(offsetY(getByTestId("speed"))).toBeCloseTo(full);
  });

  it("uses data-speed-narrow only below md (prompts/mobile-landing-parallax.md, decision 8)", () => {
    const above = setup();
    runFrame();
    expect(offsetY(above.getByTestId("speed-narrow"))).toBeCloseTo(
      offsetY(above.getByTestId("speed")),
    );
    above.unmount();

    wide = false;
    const below = setup();
    runFrame();
    expect(offsetY(below.getByTestId("speed-narrow"))).toBeCloseTo(
      -offsetY(below.getByTestId("speed")),
    );
  });

  it("sleeps when nothing moves and wakes on scroll (prompts/mobile-landing-parallax.md, AC-5)", () => {
    const { unmount } = setup();

    runFrame();
    expect(frames).toHaveLength(0);

    window.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(1);
    window.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(1);

    runFrame();
    unmount();
    window.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(0);
  });

  it("ignores the address bar resizing innerHeight mid scroll (prompts/mobile-landing-parallax.md, AC-6)", () => {
    const { getByTestId } = setup();
    runFrame();
    const before = getByTestId("speed").style.transform;

    vi.stubGlobal("innerHeight", window.innerHeight + 80);
    window.dispatchEvent(new Event("scroll"));
    runFrame();

    expect(getByTestId("speed").style.transform).toBe(before);
  });

  it("writes nothing under reduced motion", () => {
    reduced = true;
    const { getByTestId } = setup();

    expect(frames).toHaveLength(0);
    expect(getByTestId("depth").style.transform).toBe("");
  });

  it("puts every node back when reduced motion turns on", () => {
    const { getByTestId } = setup();
    runFrame();

    reduced = true;
    for (const listener of listeners) listener();
    runFrame();

    expect(getByTestId("depth").style.transform).toBe("");
    expect(getByTestId("hero").style.opacity).toBe("");
  });

  it("stops the loop and its listeners on unmount", () => {
    const { unmount } = setup();

    unmount();

    expect(listeners.size).toBe(0);
    const before = frames.length;
    runFrame();
    expect(frames.length).toBeLessThanOrEqual(before);
  });
});
