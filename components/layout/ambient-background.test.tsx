import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mountBackdrop = vi.fn();
vi.mock("@/lib/backdrop/mount", () => ({ mountBackdrop }));

import { AmbientBackground } from "./ambient-background";

/** covers: prompts/ambient-background.md, AC-1, AC-3, AC-7 */
describe("AmbientBackground", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mountBackdrop.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is hidden from assistive technology and the pointer, behind the page", () => {
    const { container } = render(<AmbientBackground />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveClass("pointer-events-none", "fixed", "-z-10");
    expect(root.querySelector("a, button, input, [tabindex]")).toBeNull();
  });

  it("renders the static vignette before anything loads", () => {
    const { container } = render(<AmbientBackground />);
    expect(container.querySelector(".backdrop-vignette")).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    expect(mountBackdrop).not.toHaveBeenCalled();
  });

  it("starts the scene once the browser is idle, and stops it on unmount", async () => {
    const cleanup = vi.fn();
    mountBackdrop.mockReturnValue(cleanup);
    const { unmount } = render(<AmbientBackground />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mountBackdrop).toHaveBeenCalledTimes(1);

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("never starts when unmounted before the idle moment", async () => {
    const { unmount } = render(<AmbientBackground />);
    unmount();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mountBackdrop).not.toHaveBeenCalled();
  });
});
