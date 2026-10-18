import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageBackground } from "./page-background";

/** covers: prompts/warm-page-background.md, AC-1, AC-2 */
describe("PageBackground", () => {
  // Reduced motion, so the loop never starts: these check the still layer.
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is hidden from assistive technology and the pointer, behind the page", () => {
    const { container } = render(<PageBackground />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("pointer-events-none", "fixed", "-z-10", "h-lvh");
    expect(root.querySelector("a, button, input, [tabindex]")).toBeNull();
  });

  it("renders every layer, in paint order, with no canvas", () => {
    const { container } = render(<PageBackground />);
    const layers = [...(container.firstElementChild?.children ?? [])].map(
      (node) =>
        [...node.classList].find((name) => name.startsWith("page-")) ?? "",
    );
    expect(layers).toEqual([
      "page-gradient",
      "page-blob-red",
      "page-blob-amber",
      "page-blob-deep",
      "page-stripes",
      "page-wash",
      "page-vignette",
      "page-grain",
    ]);
    expect(container.querySelector("canvas")).toBeNull();
  });
});
