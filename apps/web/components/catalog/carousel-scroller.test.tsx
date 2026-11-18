import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CarouselScroller } from "@/components/catalog/carousel-scroller";

/**
 * covers: spec 0021, AC-5, AC-6
 *
 * jsdom lays nothing out, so each test gives the region the sizes a browser
 * would measure and fires what a browser would: a scroll, or a resize from
 * the observer. What is under test is the wiring: which button is enabled at
 * which position, how far a press scrolls, and whether reduced motion makes
 * it instant.
 */
let resize: () => void = () => {};
let reducedMotion = false;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && reducedMotion,
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  reducedMotion = false;
});

function renderRow() {
  render(
    <CarouselScroller
      label="Top rated"
      heading={<h2>Top rated</h2>}
      seeAll={<a href="/shows/top-rated">See all</a>}
    >
      <ul>
        <li>One</li>
      </ul>
    </CarouselScroller>,
  );
  const region = screen.getByRole("region", { name: "Top rated" });
  const scrollBy = vi.fn();
  region.scrollBy = scrollBy as unknown as typeof region.scrollBy;
  return {
    region,
    scrollBy,
    back: screen.getByRole("button", { name: "Scroll Top rated back" }),
    forward: screen.getByRole("button", { name: "Scroll Top rated forward" }),
  };
}

function layout(
  region: HTMLElement,
  sizes: { scrollLeft: number; clientWidth: number; scrollWidth: number },
) {
  Object.defineProperty(region, "clientWidth", {
    configurable: true,
    value: sizes.clientWidth,
  });
  Object.defineProperty(region, "scrollWidth", {
    configurable: true,
    value: sizes.scrollWidth,
  });
  region.scrollLeft = sizes.scrollLeft;
}

describe("CarouselScroller", () => {
  it("is a focusable region named by the row title (AC-5)", () => {
    const { region } = renderRow();

    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("starts with both buttons disabled while nothing overflows (AC-6)", () => {
    const { back, forward } = renderRow();

    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();
  });

  it("enables forward only once the row overflows", () => {
    const { region, back, forward } = renderRow();

    layout(region, { scrollLeft: 0, clientWidth: 1000, scrollWidth: 2400 });
    act(() => resize());

    expect(back).toBeDisabled();
    expect(forward).toBeEnabled();
  });

  it("enables back after a scroll and disables forward at the end", () => {
    const { region, back, forward } = renderRow();

    layout(region, { scrollLeft: 1400, clientWidth: 1000, scrollWidth: 2400 });
    act(() => {
      region.dispatchEvent(new Event("scroll"));
    });

    expect(back).toBeEnabled();
    expect(forward).toBeDisabled();
  });

  it("treats within 1px of an end as the end", () => {
    const { region, back, forward } = renderRow();

    layout(region, { scrollLeft: 1, clientWidth: 1000, scrollWidth: 1002 });
    act(() => resize());

    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();
  });

  it("scrolls 90% of the visible width, smoothly", async () => {
    const user = userEvent.setup();
    const { region, scrollBy, forward } = renderRow();
    layout(region, { scrollLeft: 0, clientWidth: 1000, scrollWidth: 2400 });
    act(() => resize());

    await user.click(forward);

    expect(scrollBy).toHaveBeenCalledWith({ left: 900, behavior: "smooth" });
  });

  it("scrolls back instantly under reduced motion", async () => {
    reducedMotion = true;
    const user = userEvent.setup();
    const { region, scrollBy, back } = renderRow();
    layout(region, { scrollLeft: 1400, clientWidth: 1000, scrollWidth: 2400 });
    act(() => resize());

    await user.click(back);

    expect(scrollBy).toHaveBeenCalledWith({ left: -900, behavior: "instant" });
  });

  it("hides the buttons below md (AC-6)", () => {
    const { back } = renderRow();

    expect(back.parentElement).toHaveClass("hidden", "md:flex");
  });
});
