import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AUTH_MESSAGES, AUTH_OUTCOME } from "@/lib/auth/messages";
import { signUpAction } from "../actions";
import { SignUpForm } from "./sign-up-form";

vi.mock("../actions", () => ({
  signUpAction: vi.fn(),
}));

/**
 * covers: spec 0018, AC-12
 *
 * With email delivery off, a taken address is reported plainly, and the form
 * offers the way back to sign in that the action built.
 */
describe("SignUpForm's already registered refusal", () => {
  it("shows the message and the sign in link the action returned", async () => {
    vi.mocked(signUpAction).mockResolvedValue({
      status: "error",
      message: AUTH_MESSAGES[AUTH_OUTCOME.alreadyRegistered],
      outcome: AUTH_OUTCOME.alreadyRegistered,
      link: { href: "/sign-in?next=%2Fwatchlist", label: "Sign in instead" },
      values: { email: "someone@example.com" },
    });

    render(<SignUpForm next="/watchlist" />);
    const form = screen
      .getByRole("button", { name: "Create account" })
      .closest("form");
    if (!form) throw new Error("the submit button is outside a form");
    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists.",
    );
    expect(
      screen.getByRole("link", { name: "Sign in instead" }),
    ).toHaveAttribute("href", "/sign-in?next=%2Fwatchlist");
    expect(screen.getByLabelText("Email")).toHaveValue("someone@example.com");
  });

  it("shows no link before anything is submitted", () => {
    render(<SignUpForm />);
    expect(
      screen.queryByRole("link", { name: "Sign in instead" }),
    ).not.toBeInTheDocument();
  });
});

/** covers: prompts/account-username.md, R5 */
describe("SignUpForm's username field", () => {
  it("asks for a required username and states the rules up front", () => {
    render(<SignUpForm />);
    const field = screen.getByLabelText("Username");
    expect(field).toBeRequired();
    expect(field).toHaveAttribute("maxlength", "30");
    expect(field).toHaveAccessibleDescription(
      "2 to 30 characters: letters, numbers, _ . -",
    );
  });

  it("marks a taken name on the field and keeps what was typed", async () => {
    vi.mocked(signUpAction).mockResolvedValue({
      status: "error",
      message: AUTH_MESSAGES[AUTH_OUTCOME.usernameTaken],
      outcome: AUTH_OUTCOME.usernameTaken,
      fieldErrors: { username: "That username is taken." },
      values: { email: "someone@example.com", username: "tester_one" },
    });

    render(<SignUpForm />);
    const form = screen
      .getByRole("button", { name: "Create account" })
      .closest("form");
    if (!form) throw new Error("the submit button is outside a form");
    fireEvent.submit(form);

    const field = await screen.findByDisplayValue("tester_one");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining("That username is taken."),
    );
    expect(screen.getByLabelText("Email")).toHaveValue("someone@example.com");
  });
});
