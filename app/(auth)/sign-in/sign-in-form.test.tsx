import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  SIGN_IN_NOTICE,
  SIGN_IN_NOTICES,
} from "@/lib/auth/messages";
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
