/**
 * covers: prompts/mobile-look-account.md, decision 4 (the web's AuthField:
 * the eye says what it will do and swaps the hidden text, an error sits
 * under its field and is read with it) and requirement 4 (never colour
 * alone; one refusal is not said twice).
 */

import { failure } from "@bestats/core/auth/action-state";
import { AUTH_OUTCOME } from "@bestats/core/auth/messages";
import { render, screen, userEvent } from "@testing-library/react-native";

import { FormField, formAlert } from "./form-field";

test("hides a password until the eye shows it, and says which it will do", async () => {
  await render(<FormField label="Password" secure value="hunter22" />);
  const field = screen.getByLabelText("Password");
  expect(field.props.secureTextEntry).toBe(true);

  expect(
    screen.getByRole("button", { name: "Show password" }),
  ).not.toBeSelected();

  await userEvent.press(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
  // The app's pressed toggle state (as GlassButton and the score sheet), the
  // web's `aria-pressed`.
  expect(screen.getByRole("button", { name: "Hide password" })).toBeSelected();
});

test("draws no eye on a field that is not a password", async () => {
  await render(<FormField label="Email" value="" />);
  expect(screen.queryByRole("button", { name: "Show password" })).toBeNull();
  expect(screen.getByLabelText("Email").props.secureTextEntry).toBe(false);
});

test("shows an error under the field, as an alert, and reads it with the field", async () => {
  await render(
    <FormField
      label="Email"
      hint="Your address"
      error="Enter a valid email address."
      value="x"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a valid email address.",
  );
  expect(screen.getByLabelText("Email").props.accessibilityHint).toBe(
    "Enter a valid email address. Your address.",
  );
});

test("keeps the form alert only when no field already says it", () => {
  const taken = failure(AUTH_OUTCOME.usernameTaken, ["username"]);
  expect(formAlert(taken)).toBeNull();
  const limited = failure(AUTH_OUTCOME.rateLimited);
  expect(formAlert(limited)).toBe(limited.message);
  expect(formAlert({ status: "idle" })).toBeNull();
});
