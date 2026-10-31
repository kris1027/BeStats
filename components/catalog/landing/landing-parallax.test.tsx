import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LARGE, LandingParallax, WIDE } from "./landing-parallax";

/**
 * covers: prompts/home-parallax-landing.md, AC-7 (decisions 9 and 16);
 * prompts/mobile-landing-parallax.md, AC-1, AC-2, AC-5, AC-6, AC-7 and AC-9
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Gives a node the box jsdom cannot lay out. */
function box(node: HTMLElement, rect: Partial<DOMRect>) {
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    ...rect,
  } as DOMRect);
}

function size(node: HTMLElement, sizes: Record<string, number>) {
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(node, key, { value, configurable: true });
  }
}

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

  it("measures from the 100svh probe, not innerHeight (prompts/mobile-landing-parallax.md, AC-6)", () => {
    // The probe is the loop's fixed, hidden box; give it a 700px small viewport.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.style.position === "fixed" &&
          this.style.visibility === "hidden"
          ? 700
          : 0;
      },
    );
    const { getByTestId } = setup();

    runFrame();

    // A root at the top: offset -350px from the centre, at speed 0.2.
    expect(offsetY(getByTestId("speed"))).toBeCloseTo(70);
  });

  it("scrolls a tabbed-to Trending card into view (prompts/mobile-landing-parallax.md, AC-7)", () => {
    wide = false;
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const { getByTestId } = render(
      <LandingParallax>
        <section data-pin="" data-testid="pin">
          <div data-testid="frame">
            <ul data-pin-track="" data-testid="track">
              <li data-testid="item">
                <a href="/shows/1">Card</a>
              </li>
            </ul>
          </div>
        </section>
      </LandingParallax>,
    );
    size(getByTestId("pin"), { offsetHeight: 3000 });
    size(getByTestId("frame"), { clientWidth: 400 });
    size(getByTestId("track"), { scrollWidth: 2000 });
    box(getByTestId("pin"), { top: 500 });
    box(getByTestId("item"), { left: 1000, width: 200 });

    getByTestId("item").querySelector("a")?.focus();

    // Centre 1100px along a 1600px travel, past half the 400px frame.
    const progress = (1100 - 200) / 1600;
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 500 + progress * (3000 - window.innerHeight),
      behavior: "instant",
    });
  });

  it("holds a focused Upcoming card in view instead of sliding it (AC-7)", () => {
    wide = false;
    const { getByTestId } = render(
      <LandingParallax>
        <div data-testid="frame">
          <ul data-marquee="1" data-testid="row">
            <li data-testid="item">
              <a href="/shows/1">Card</a>
            </li>
          </ul>
        </div>
      </LandingParallax>,
    );
    size(getByTestId("frame"), { clientWidth: 400 });
    size(getByTestId("row"), { scrollWidth: 2000 });
    box(getByTestId("item"), { left: 1000, width: 200 });

    getByTestId("item").querySelector("a")?.focus();
    runFrame();

    // The card's centre, 1100px along, sits at the frame's centre.
    expect(getByTestId("row").style.transform).toBe(
      "translate3d(-900px, 0, 0)",
    );
  });

  it("shrinks and dims a deck row as the next slides over it (prompts/mobile-landing-parallax.md, AC-9)", () => {
    wide = false;
    const { getByTestId } = render(
      <LandingParallax>
        <ul data-deck="">
          <li data-deck-card="" data-deck-row="0" data-testid="row-0">
            <span data-deck-shade="" data-testid="shade-0" />
          </li>
          <li data-deck-card="" data-deck-row="1" data-testid="row-1">
            <span data-deck-shade="" data-testid="shade-1" />
          </li>
        </ul>
      </LandingParallax>,
    );
    const front = getByTestId("row-1");
    // Rows 400px apart in the flow; the second has travelled half of that.
    Object.defineProperty(getByTestId("row-0"), "offsetHeight", {
      value: 400,
    });
    vi.spyOn(front, "getBoundingClientRect").mockReturnValue({
      top: 200,
    } as DOMRect);

    runFrame();

    expect(getByTestId("row-0").style.transform).toBe("scale(0.97)");
    expect(getByTestId("shade-0").style.opacity).toBe("0.11");
    expect(front.style.transform).toBe("scale(1)");
    expect(getByTestId("shade-1").style.opacity).toBe("0");
  });

  it("brings a tabbed-to deck card to the front (prompts/mobile-landing-parallax.md, AC-9)", () => {
    wide = false;
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const { getByTestId } = render(
      <LandingParallax>
        <ul data-deck="" data-testid="deck">
          <li data-deck-card="" data-deck-row="0" data-testid="row-0" />
          <li data-deck-card="" data-deck-row="2" style={{ top: 96 }}>
            <a href="/shows/1">Card</a>
          </li>
        </ul>
      </LandingParallax>,
    );
    size(getByTestId("row-0"), { offsetHeight: 400 });
    box(getByTestId("deck"), { top: 1000 });

    screen.getByRole("link", { name: "Card" }).focus();

    // Two 400px rows in, less the 96px it sticks at below the top.
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 1000 + 2 * 400 - 96,
      behavior: "instant",
    });
  });

  it("leaves the deck alone from md", () => {
    const { getByTestId } = render(
      <LandingParallax>
        <ul data-deck="">
          <li data-deck-card="" data-deck-row="0" data-testid="card" />
        </ul>
      </LandingParallax>,
    );

    runFrame();

    expect(getByTestId("card").style.transform).toBe("");
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
