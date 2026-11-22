import { RECOVERY_UNAVAILABLE_MESSAGE } from "@bestats/core/auth/messages";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "./forgot-password/page";
import AppResetPasswordPage from "./reset-password/app/page";
import ResetPasswordPage from "./reset-password/page";

vi.mock("./actions", () => ({
  requestPasswordResetAction: vi.fn(),
  resetPasswordAction: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * covers: spec 0018, AC-13
 *
 * While production sends no email, neither recovery page may show a form that
 * pretends to send something. Each shows the notice naming where to write.
 */
describe.each([
  ["/forgot-password", ForgotPasswordPage],
  ["/reset-password", ResetPasswordPage],
])("%s", (_path, Page) => {
  it("shows the notice and no form while email delivery is off", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "off");
    const { container } = render(<Page />);

    expect(screen.getByText(RECOVERY_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/sign-in");
  });

  it("shows the form while email delivery is on", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "on");
    const { container } = render(<Page />);

    expect(container.querySelector("form")).not.toBeNull();
    expect(
      screen.queryByText(RECOVERY_UNAVAILABLE_MESSAGE),
    ).not.toBeInTheDocument();
  });
});

/**
 * covers: spec 0033, child 0036 (Password reset and deep links)
 *
 * A reset asked in the app can only be redeemed on that phone (PKCE), so the
 * browser fallback offers no form, whatever the email flag says, and points
 * the visitor back to the app.
 */
describe("/reset-password/app", () => {
  it.each(["on", "off"])(
    "says to open the link in the app and shows no form (email %s)",
    (delivery) => {
      vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", delivery);
      const { container } = render(<AppResetPasswordPage />);

      expect(
        screen.getByRole("heading", { name: "Open the link on your phone" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/only works in the BeStats app/)).toBeVisible();
      expect(container.querySelector("form")).toBeNull();
      expect(
        screen.getByRole("link", { name: "Back to sign in" }),
      ).toHaveAttribute("href", "/sign-in");
    },
  );
});
