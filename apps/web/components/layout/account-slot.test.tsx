import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOptionalUser } from "@/lib/auth/user";
import { AccountSlot } from "./account-slot";

vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/shows",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/profile", () => ({
  getOwnProfile: vi.fn(async () => null),
}));

// Reading the session with no configuration throws, exactly as the real
// server client does, so a test that reaches it fails the way the page did.
vi.mock("@/lib/auth/user", () => ({
  getOptionalUser: vi.fn(async () => {
    throw new Error("Invalid public environment configuration.");
  }),
}));

/**
 * covers: public catalog without auth configuration
 *
 * This slot is in the root layout, so it renders on every page. With no
 * Supabase settings it used to read the session anyway, throw, and take the
 * public catalog down with it on a fresh clone.
 */

// The menu listens for the `md` breakpoint while open; jsdom has no
// `matchMedia`.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) =>
    Object.assign(new EventTarget(), { matches: false, media: query }),
  );
});

describe("AccountSlot without auth configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders Sign in without reading the session", async () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SITE_URL",
    ]) {
      vi.stubEnv(name, undefined);
    }

    render(await AccountSlot({ variant: "desktop" }));

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  // covers: prompts/mobile-navigation.md, R2
  it("renders the menu button on mobile, its sheet holding Sign in", async () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SITE_URL",
    ]) {
      vi.stubEnv(name, undefined);
    }

    render(await AccountSlot({ variant: "mobile" }));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.queryByRole("navigation", { name: "Library" })).toBeNull();
  });
});
