import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0008, AC-14, AC-15
 *
 * The two signed in layouts. The session is the boundary, so
 * `getOptionalUser` returns a user and the public env is stubbed as complete.
 */
vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/auth/user", () => ({
  getOptionalUser: vi.fn(async () => ({
    id: "user-a",
    email: "kris1027@example.test",
  })),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/watched" }));

const { AccountSlot } = await import("./account-slot");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
});

describe("AccountSlot, signed in on desktop (AC-14)", () => {
  it("shows the library links, the account button and Sign out", async () => {
    render(await AccountSlot({ variant: "desktop" }));
    expect(
      screen.getByRole("navigation", { name: "Library" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watched" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "kris1027" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });
});

describe("AccountSlot, signed in on mobile (AC-15)", () => {
  it("shows the avatar link and a menu button, with no loose Sign out", async () => {
    render(await AccountSlot({ variant: "mobile" }));
    expect(screen.getByRole("link", { name: "kris1027" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(
      screen.getByRole("button", { name: "Open menu" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Library" })).toBeNull();
  });

  it("opens a sheet holding the links, the account row and Sign out", async () => {
    const user = userEvent.setup();
    render(await AccountSlot({ variant: "mobile" }));
    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog).toContainElement(
      screen.getByRole("link", { name: "Watchlist" }),
    );
    expect(screen.getByRole("link", { name: "Watched" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The page behind the modal is hidden from assistive technology, so the
    // one account link still exposed is the sheet's account row.
    expect(dialog).toContainElement(
      screen.getByRole("link", { name: "kris1027" }),
    );
    expect(dialog).toContainElement(
      screen.getByRole("button", { name: "Sign out" }),
    );
  });

  it("closes the sheet when a link in it is chosen", async () => {
    const user = userEvent.setup();
    render(await AccountSlot({ variant: "mobile" }));
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: "Watchlist" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
