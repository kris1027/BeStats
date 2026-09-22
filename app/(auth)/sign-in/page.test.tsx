import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  SIGN_IN_NOTICE,
  SIGN_IN_NOTICES,
} from "@/lib/auth/messages";
import SignInPage from "./page";

vi.mock("../actions", () => ({
  signInAction: vi.fn(),
}));

type Element = React.ReactElement<Record<string, unknown>>;

/**
 * Renders the form the way the page's streamed slot would. jsdom's client
 * renderer does not reliably commit an async Server Component, so the slot
 * inside the page's Suspense boundary is awaited as the function it is and the
 * element it returns is rendered. That runs the page's real query string
 * handling, with no copy of it here.
 */
async function renderSlot(params: Record<string, string>) {
  const page = SignInPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(params),
  } as PageProps<"/sign-in">) as Element;
  const boundary = page.props.children as Element;
  const slot = boundary.props.children as Element;
  const resolve = slot.type as (props: unknown) => Promise<React.ReactElement>;

  render(await resolve(slot.props));
}

/**
 * covers: spec 0005, AC-8, AC-21
 *
 * `/sign-in?notice=` and `?error=` are links anyone can build and hand out, so
 * the page must render only copy from its own tables and never the query
 * string itself.
 */
describe("the sign in page's query string", () => {
  it("shows the reset confirmation for the notice the reset action sends (AC-8)", async () => {
    await renderSlot({ notice: SIGN_IN_NOTICE.passwordReset });

    expect(screen.getByRole("status")).toHaveTextContent(
      SIGN_IN_NOTICES[SIGN_IN_NOTICE.passwordReset],
    );
  });

  it("shows the callback error copy for a known error code", async () => {
    await renderSlot({ error: AUTH_OUTCOME.invalidLink });

    expect(screen.getByRole("alert")).toHaveTextContent(
      AUTH_MESSAGES[AUTH_OUTCOME.invalidLink],
    );
  });

  it.each([
    ["notice", "Your account is locked, call 555 0100"],
    ["error", "Your account is locked, call 555 0100"],
  ])("never renders an unknown %s as text", async (key, value) => {
    await renderSlot({ [key]: value });

    expect(screen.queryByText(/555 0100/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["notice", "toString"],
    ["notice", "constructor"],
    ["error", "toString"],
  ])("treats the inherited object key %s=%s as unknown", async (key, value) => {
    // `in` walks the prototype chain, so these name a function, not copy.
    await renderSlot({ [key]: value });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
