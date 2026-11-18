import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { AuthField } from "@/components/auth/auth-field";

/**
 * covers: spec 0005, AC-21
 *
 * Every auth screen is built from this field, so its accessibility is the
 * accessibility of the whole feature. The failure it guards against is the
 * usual one: an error styled red beside an input, connected to it by nothing,
 * so a screen reader announces the input as valid and the message as stray
 * text. Colour is not an association.
 *
 * The reveal toggle is tested from the keyboard because that is where it breaks.
 * A div with an onClick works fine with a mouse and is unreachable by Tab.
 */
describe("AuthField (AC-21)", () => {
  it("binds the label to the input", () => {
    render(<AuthField label="Email" name="email" type="email" />);

    // Found by its label, which only works if the two are really bound.
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
  });

  it("announces an error as belonging to its field, not as loose text", () => {
    render(
      <AuthField label="Email" name="email" error="Enter a valid address." />,
    );

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "Enter a valid address.",
    );
  });

  it("marks nothing invalid when there is no error", () => {
    render(<AuthField label="Email" name="email" />);

    const input = screen.getByLabelText("Email");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("gives two fields on one form distinct ids", () => {
    render(
      <>
        <AuthField
          label="Current password"
          name="currentPassword"
          type="password"
        />
        <AuthField label="New password" name="password" type="password" />
      </>,
    );

    // A shared id would point both labels at the same input, so typing in one
    // field would appear to be the other.
    const first = screen.getByLabelText("Current password");
    const second = screen.getByLabelText("New password");
    expect(first.id).not.toBe(second.id);
  });

  it("hides the password by default and reveals it from the keyboard", async () => {
    const user = userEvent.setup();
    render(<AuthField label="Password" name="password" type="password" />);

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: "Show password" });
    toggle.focus();
    await user.keyboard("{Enter}");

    expect(input).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("does not offer a reveal toggle on a field that is not a password", () => {
    render(<AuthField label="Email" name="email" type="email" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the reveal toggle out of the form's submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <AuthField label="Password" name="password" type="password" />
      </form>,
    );

    // `type="button"`, not the default `submit`: revealing a password must not
    // post a half filled form.
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
