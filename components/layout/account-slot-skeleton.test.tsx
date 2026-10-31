import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountSlotSkeleton } from "./account-slot-skeleton";

/**
 * covers: prompts/mobile-navigation.md, decision 11
 *
 * jsdom cannot lay the bar out, so the footprints are asserted as the
 * classes that draw them, each the size of the control that replaces it at
 * that width: the 40px menu button, the 42px avatar button and the 86px
 * Sign out measured in the running app.
 */
describe("AccountSlotSkeleton", () => {
  it("is the menu button's 40px circle on a phone", () => {
    const { container } = render(<AccountSlotSkeleton variant="mobile" />);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toHaveClass("size-10", "rounded-full");
  });

  it("is the menu button below xl and the avatar and Sign out from xl on desktop", () => {
    const { container } = render(<AccountSlotSkeleton variant="desktop" />);
    const [menu, row] = [...container.children];
    expect(menu).toHaveClass("size-10", "xl:hidden");
    expect(row).toHaveClass("hidden", "xl:flex", "gap-2");
    const [avatar, signOut] = [...row.children];
    expect(avatar).toHaveClass("h-10", "w-[2.625rem]", "2xl:w-28");
    expect(signOut).toHaveClass("h-10", "w-[5.375rem]");
  });

  it("is never a Sign in button, which would flash the wrong state", () => {
    const { container } = render(<AccountSlotSkeleton variant="desktop" />);
    expect(container.querySelector("a, button")).toBeNull();
  });
});
