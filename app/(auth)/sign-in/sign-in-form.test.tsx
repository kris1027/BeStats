import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  SIGN_IN_NOTICE,
  SIGN_IN_NOTICES,
} from "@/lib/auth/messages";
import { signInAction } from "../actions";
import { SignInForm } from "./sign-in-form";

// The action runs on the server and pulls a Supabase client with it. The form
// only needs something to hand `useActionState`; nothing here submits.
vi.mock("../actions", () => ({
  signInAction: vi.fn(),
}));

const RESET_NOTICE = SIGN_IN_NOTICES[SIGN_IN_NOTICE.passwordReset];
const LINK_ERROR = AUTH_MESSAGES[AUTH_OUTCOME.invalidLink];

/**
 * covers: spec 0005, AC-8, AC-21
 *
 * After a reset the action signs everyone out and sends the person here with a
 * notice. The form is where that notice becomes visible, and where it must
 * give way to an error from the callback if both ever arrive.
 */
describe("SignInForm's first render", () => {
  it("shows the reset confirmation as a polite status, not an alert (AC-8)", () => {
    render(<SignInForm initialNotice={RESET_NOTICE} />);

    expect(screen.getByRole("status")).toHaveTextContent(RESET_NOTICE);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a callback error as an alert (AC-21)", () => {
    render(<SignInForm initialError={LINK_ERROR} />);

    expect(screen.getByRole("alert")).toHaveTextContent(LINK_ERROR);
  });

  it("lets the error win when both arrive, because it is the one to act on", () => {
    render(
      <SignInForm initialError={LINK_ERROR} initialNotice={RESET_NOTICE} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(LINK_ERROR);
    expect(screen.queryByText(RESET_NOTICE)).not.toBeInTheDocument();
  });

  it("shows no message band when there is nothing to say", () => {
    render(<SignInForm />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not offer the resend link for a notice", () => {
    // The resend link belongs only to the unconfirmed address outcome (AC-6).
    render(<SignInForm initialNotice={RESET_NOTICE} />);

    expect(
      screen.queryByRole("link", { name: /confirmation link/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the fields labelled and usable under a notice", () => {
    render(<SignInForm initialNotice={RESET_NOTICE} />);

    expect(screen.getByLabelText("Email")).toBeEnabled();
    expect(screen.getByLabelText("Password")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});

/**
 * covers: spec 0005, AC-6, AC-10
 *
 * The resend link used to be a bare `/check-email`. Someone sent to sign in
 * from a private page with an unconfirmed address had to retype it, and after
 * confirming landed on `/shows` instead of the page they started from.
 */
describe("SignInForm's resend link for an unconfirmed address", () => {
  it("carries the typed email and the next path to /check-email", async () => {
    vi.mocked(signInAction).mockResolvedValue({
      status: "error",
      message: AUTH_MESSAGES[AUTH_OUTCOME.emailNotConfirmed],
      outcome: AUTH_OUTCOME.emailNotConfirmed,
      values: { email: "someone+tag@example.com" },
    });

    render(<SignInForm next="/account?tab=a" />);
    const form = screen
      .getByRole("button", { name: "Sign in" })
      .closest("form");
    if (!form) throw new Error("the sign in button is outside a form");
    fireEvent.submit(form);

    const link = await screen.findByRole("link", {
      name: /confirmation link/i,
    });
    const href = new URL(link.getAttribute("href") ?? "", "http://x");

    expect(href.pathname).toBe("/check-email");
    expect(href.searchParams.get("email")).toBe("someone+tag@example.com");
    expect(href.searchParams.get("next")).toBe("/account?tab=a");
  });
});
