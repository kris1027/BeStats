import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getOptionalUser } from "@/lib/auth/user";
import { AccountSlot } from "./account-slot";

vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));

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

    render(await AccountSlot());

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(getOptionalUser).not.toHaveBeenCalled();
  });
});
