import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startFilmScene = vi.fn();
vi.mock("@/lib/film-scene/start", () => ({ startFilmScene }));

import { PageBackground } from "./page-background";

/** covers: prompts/film-strip-background.md, AC-1, AC-4, AC-8 */
describe("PageBackground", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    startFilmScene.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is hidden from assistive technology and the pointer, behind the page", () => {
    const { container } = render(<PageBackground />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("pointer-events-none", "fixed", "-z-10");
    expect(root.querySelector("a, button, input, [tabindex]")).toBeNull();
  });

  it("renders the gradient and vignette before anything loads", () => {
    const { container } = render(<PageBackground />);
    expect(container.firstElementChild).toHaveClass("page-gradient");
    expect(container.querySelector(".page-vignette")).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    expect(startFilmScene).not.toHaveBeenCalled();
  });

  it("starts the scene once the browser is idle, and stops it on unmount", async () => {
    const cleanup = vi.fn();
    startFilmScene.mockReturnValue(cleanup);
    const { unmount } = render(<PageBackground />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(startFilmScene).toHaveBeenCalledTimes(1);

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("never starts when unmounted before the idle moment", async () => {
    const { unmount } = render(<PageBackground />);
    unmount();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(startFilmScene).not.toHaveBeenCalled();
  });
});
