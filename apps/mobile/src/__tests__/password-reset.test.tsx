import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  AUTH_PANEL_COPY,
  RECOVERY_UNAVAILABLE_MESSAGE,
  RESET_REQUESTED_MESSAGE,
  SIGN_IN_NOTICE,
  SIGN_IN_NOTICES,
} from "@bestats/core/auth/messages";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import ForgotPassword from "@/app/forgot-password";
import AppResetPassword from "@/app/reset-password/app";
import SignIn from "@/app/sign-in";
import { Text } from "@/components/text";

/**
 * covers: spec 0033, AC-16 and child 0036 (Password reset and deep links);
 * prompts/mobile-deep-links.md decisions 6 to 8; spec 0018, AC-13 (no
 * recovery while no email is sent); AGENTS.md section 11 (no false success);
 * prompts/mobile-look-account.md, decisions 4 and 5 (the web's heading and
 * line, the eye, the error under its field).
 */
let mockDelivery: "on" | "off" = "on";
jest.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    EXPO_PUBLIC_AUTH_EMAIL_DELIVERY: mockDelivery,
    EXPO_PUBLIC_API_BASE_URL: "http://localhost:3000",
  }),
}));

const mockSignOut = jest.fn(async () => {});
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: null,
    notice: null,
    clearNotice: () => {},
    signOut: mockSignOut,
  }),
}));

const mockReset = jest.fn();
const mockExchange = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      resetPasswordForEmail: mockReset,
      exchangeCodeForSession: mockExchange,
      updateUser: mockUpdateUser,
    },
  }),
}));

async function open(url: string) {
  await renderRouter(
    {
      "sign-in": SignIn,
      "sign-up": () => <Text>Sign up screen</Text>,
      "forgot-password": ForgotPassword,
      "reset-password/app": AppResetPassword,
    },
    { initialUrl: url },
  );
}

beforeEach(() => {
  mockDelivery = "on";
  jest.clearAllMocks();
});

describe("Sign in's recovery link", () => {
  it("offers Forgot password? while email delivery is on", async () => {
    await open("/sign-in");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Forgot password?" }));
    expect(
      await screen.findByRole("button", { name: "Send the reset link" }),
    ).toBeOnTheScreen();
  });

  it("leaves it out while email delivery is off", async () => {
    mockDelivery = "off";
    await open("/sign-in");
    expect(
      screen.queryByRole("button", { name: "Forgot password?" }),
    ).not.toBeOnTheScreen();
  });

  it("shows the password saved notice a finished reset sends", async () => {
    await open(`/sign-in?notice=${SIGN_IN_NOTICE.passwordReset}`);
    expect(
      screen.getByText(SIGN_IN_NOTICES[SIGN_IN_NOTICE.passwordReset]),
    ).toBeOnTheScreen();
  });

  it("ignores an unknown notice value", async () => {
    await open("/sign-in?notice=anything");
    expect(
      screen.queryByText(SIGN_IN_NOTICES[SIGN_IN_NOTICE.passwordReset]),
    ).not.toBeOnTheScreen();
  });
});

describe("Forgot password", () => {
  it("asks Supabase for a link back to /reset-password/app", async () => {
    mockReset.mockResolvedValue({ data: {}, error: null });
    await open("/forgot-password");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@example.test");
    await user.press(
      screen.getByRole("button", { name: "Send the reset link" }),
    );

    expect(await screen.findByText(RESET_REQUESTED_MESSAGE)).toBeOnTheScreen();
    expect(mockReset).toHaveBeenCalledWith("a@example.test", {
      redirectTo: "http://localhost:3000/reset-password/app",
    });
  });

  it("reads the same for an address with no account", async () => {
    mockReset.mockResolvedValue({
      data: null,
      error: { code: "user_not_found", status: 400 },
    });
    await open("/forgot-password");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "nobody@example.test");
    await user.press(
      screen.getByRole("button", { name: "Send the reset link" }),
    );
    expect(await screen.findByText(RESET_REQUESTED_MESSAGE)).toBeOnTheScreen();
  });

  it("shows a rate limit and claims nothing was sent", async () => {
    mockReset.mockResolvedValue({
      data: null,
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    await open("/forgot-password");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@example.test");
    await user.press(
      screen.getByRole("button", { name: "Send the reset link" }),
    );
    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.rateLimited]),
    ).toBeOnTheScreen();
    expect(screen.queryByText(RESET_REQUESTED_MESSAGE)).not.toBeOnTheScreen();
  });

  it("refuses an invalid address before asking Supabase", async () => {
    await open("/forgot-password");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "not an address");
    await user.press(
      screen.getByRole("button", { name: "Send the reset link" }),
    );
    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeOnTheScreen();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it("shows the notice and no form while email delivery is off", async () => {
    mockDelivery = "off";
    await open("/forgot-password");
    expect(screen.getByText(RECOVERY_UNAVAILABLE_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Email")).not.toBeOnTheScreen();
  });
});

describe("/reset-password/app", () => {
  it("exchanges the code once, saves, signs out everywhere, then opens sign in", async () => {
    mockExchange.mockResolvedValue({ data: {}, error: null });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    await open("/reset-password/app?code=abc");

    const field = await screen.findByLabelText("New password");
    expect(mockExchange).toHaveBeenCalledTimes(1);
    expect(mockExchange).toHaveBeenCalledWith("abc");

    const user = userEvent.setup();
    await user.type(field, "a new long password");
    await user.press(screen.getByRole("button", { name: "Set new password" }));

    expect(
      await screen.findByText(SIGN_IN_NOTICES[SIGN_IN_NOTICE.passwordReset]),
    ).toBeOnTheScreen();
    expect(mockUpdateUser).toHaveBeenCalledWith({
      password: "a new long password",
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("opens with the web's heading and line, the eye and the field's own error", async () => {
    mockExchange.mockResolvedValue({ data: {}, error: null });
    await open("/reset-password/app?code=abc");

    const field = await screen.findByLabelText("New password");
    expect(
      screen.getByRole("header", { name: AUTH_PANEL_COPY.resetPassword.title }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(AUTH_PANEL_COPY.resetPassword.description),
    ).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.type(field, "short");
    expect(field.props.secureTextEntry).toBe(true);
    await user.press(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("New password").props.secureTextEntry).toBe(
      false,
    );

    await user.press(screen.getByRole("button", { name: "Set new password" }));
    const tooShort = AUTH_MESSAGES[AUTH_OUTCOME.passwordTooShort];
    expect(
      (await screen.findByLabelText("New password")).props.accessibilityHint,
    ).toContain(tooShort);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("shows the invalid link message for a used or foreign code", async () => {
    mockExchange.mockResolvedValue({
      data: null,
      error: { code: "flow_state_not_found", status: 404 },
    });
    await open("/reset-password/app?code=used");
    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.invalidLink]),
    ).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.press(
      screen.getByRole("button", { name: "Request a new reset link" }),
    );
    expect(
      await screen.findByRole("button", { name: "Send the reset link" }),
    ).toBeOnTheScreen();
  });

  it("shows the invalid link message when the link has no code", async () => {
    await open("/reset-password/app");
    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.invalidLink]),
    ).toBeOnTheScreen();
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("keeps the form and says why when the save fails", async () => {
    mockExchange.mockResolvedValue({ data: {}, error: null });
    mockUpdateUser.mockResolvedValue({
      data: null,
      error: { code: "over_request_rate_limit", status: 429 },
    });
    await open("/reset-password/app?code=abc");
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("New password"),
      "a new long password",
    );
    await user.press(screen.getByRole("button", { name: "Set new password" }));

    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.rateLimited]),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("New password")).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("shows the notice and exchanges nothing while email delivery is off", async () => {
    mockDelivery = "off";
    await open("/reset-password/app?code=abc");
    expect(screen.getByText(RECOVERY_UNAVAILABLE_MESSAGE)).toBeOnTheScreen();
    await waitFor(() => expect(mockExchange).not.toHaveBeenCalled());
  });
});
