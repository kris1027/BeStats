import {
  ACCOUNT_NOTICES,
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  DELETE_ACCOUNT_COPY,
  USERNAME_UPDATED_MESSAGE,
} from "@bestats/core/auth/messages";
import type { QueryClient } from "@tanstack/react-query";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";

import SignUp from "@/app/sign-up";
import { ApiError } from "@/lib/api";
import { AccountScreen } from "@/screens/account-screen";
import { DeleteAccountScreen } from "@/screens/delete-account-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-account-deletion.md decisions 5, 6 and 8; spec 0033,
 * AC-12 (delete behind typing DELETE, then signed out); spec 0035, Sign up on
 * mobile (availability, signUp, then the claim); AGENTS.md section 11 (a
 * failed delete keeps you signed in and says so).
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));

let mockSession: object | null = { user: { email: "a@example.test" } };
const mockEndLocalSession = jest.fn(async () => {});
const mockSignOut = jest.fn(async () => {});
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: mockSession,
    loading: false,
    signOut: mockSignOut,
    endLocalSession: mockEndLocalSession,
    clearNotice: () => {},
  }),
}));

const mockRpc = jest.fn();
const mockSignUp = jest.fn();
jest.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ rpc: mockRpc, auth: { signUp: mockSignUp } }),
}));

const PROFILE = "/api/v1/me/profile";
const DELETE = "/api/v1/me/account/delete";

let client: QueryClient;

async function open(url: string) {
  await renderRouter(
    {
      account: () => <Text>Account screen</Text>,
      "sign-up": SignUp,
      "sign-in": () => <Text>Sign in screen</Text>,
    },
    { initialUrl: url, wrapper: titleWrapper(client) },
  );
}

async function openAccount(url = "/account") {
  await renderRouter(
    {
      account: () => {
        const { useLocalSearchParams } = jest.requireActual("expo-router");
        const { notice } = useLocalSearchParams();
        return <AccountScreen notice={notice} />;
      },
      "account/delete": DeleteAccountScreen,
      "sign-in": () => <Text>Sign in screen</Text>,
      "sign-up": () => <Text>Sign up screen</Text>,
    },
    { initialUrl: url, wrapper: titleWrapper(client) },
  );
}

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
  mockSession = { user: { email: "a@example.test" } };
  jest.clearAllMocks();
});

describe("Account tab", () => {
  it("offers Sign in and Create account signed out, with no private request", async () => {
    mockSession = null;
    await openAccount();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeOnTheScreen();
    await userEvent.press(
      screen.getByRole("button", { name: "Create an account" }),
    );
    expect(await screen.findByText("Sign up screen")).toBeOnTheScreen();
    expect(mockApi.calls).toEqual([]);
  });

  it("shows the username, the email and the lock line from the server", async () => {
    mockApi.on("GET", PROFILE, () => ({
      username: "tester_one",
      usernameChangeableAt: "2026-11-25T12:00:00Z",
    }));
    await openAccount();
    expect(await screen.findByText(/a@example\.test/)).toBeOnTheScreen();
    expect(screen.getByText(/You can change it again on/)).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Save username" }),
    ).toBeDisabled();
  });

  it("saves a username and says so only after the server answers", async () => {
    mockApi.on("GET", PROFILE, () => ({
      username: "tester_one",
      usernameChangeableAt: null,
    }));
    mockApi.on("PUT", PROFILE, () => ({ ok: true, changed: true }));
    await openAccount();
    const field = await screen.findByLabelText("Username");
    await userEvent.clear(field);
    await userEvent.type(field, "tester_two");
    await userEvent.press(
      screen.getByRole("button", { name: "Save username" }),
    );
    expect(await screen.findByText(USERNAME_UPDATED_MESSAGE)).toBeOnTheScreen();
    expect(mockApi.callsTo("PUT", PROFILE)[0]?.body).toEqual({
      username: "tester_two",
    });
  });

  it("shows the server's refusal for a taken name", async () => {
    mockApi.on("GET", PROFILE, () => ({
      username: "tester_one",
      usernameChangeableAt: null,
    }));
    mockApi.on("PUT", PROFILE, () => {
      throw new ApiError(
        409,
        "conflict",
        AUTH_MESSAGES[AUTH_OUTCOME.usernameTaken],
        "username_taken",
      );
    });
    await openAccount();
    const field = await screen.findByLabelText("Username");
    await userEvent.clear(field);
    await userEvent.type(field, "someone_else");
    await userEvent.press(
      screen.getByRole("button", { name: "Save username" }),
    );
    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.usernameTaken]),
    ).toBeOnTheScreen();
  });

  it("asks for a username first, with the taken notice after sign up", async () => {
    mockApi.on("GET", PROFILE, () => ({
      username: null,
      usernameChangeableAt: null,
    }));
    await openAccount("/account?notice=username-taken");
    expect(
      await screen.findByText(ACCOUNT_NOTICES["username-taken"]),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("Choose a username. You can change it once a week."),
    ).toBeOnTheScreen();
  });

  it("shows a failed profile read with Retry, never an unclaimed name", async () => {
    mockApi.on("GET", PROFILE, () => {
      throw new ApiError(500, "internal", "Something went wrong.");
    });
    await openAccount();
    expect(
      await screen.findByText("We couldn't load your account"),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();
    expect(screen.queryByText(/Choose a username/)).toBeNull();
  });
});

describe("Delete account", () => {
  it("stays disabled until the field holds exactly DELETE", async () => {
    await openAccount("/account/delete");
    const button = screen.getByRole("button", {
      name: DELETE_ACCOUNT_COPY.button,
    });
    const field = screen.getByLabelText(DELETE_ACCOUNT_COPY.confirmLabel);
    await userEvent.type(field, "delete");
    expect(button).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "DELETE");
    expect(button).toBeEnabled();
  });

  it("deletes, ends the session on this phone and says so", async () => {
    mockApi.on("POST", DELETE, () => null);
    await openAccount("/account/delete");
    await userEvent.type(
      screen.getByLabelText(DELETE_ACCOUNT_COPY.confirmLabel),
      "DELETE",
    );
    await userEvent.press(
      screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.button }),
    );
    expect(
      await screen.findByText(DELETE_ACCOUNT_COPY.deleted),
    ).toBeOnTheScreen();
    expect(mockApi.callsTo("POST", DELETE)[0]?.body).toEqual({
      confirm: "DELETE",
    });
    expect(mockEndLocalSession).toHaveBeenCalledTimes(1);
  });

  it("keeps you signed in and says the account is still there on failure", async () => {
    mockApi.on("POST", DELETE, () => {
      throw new ApiError(500, "internal", "nope");
    });
    await openAccount("/account/delete");
    await userEvent.type(
      screen.getByLabelText(DELETE_ACCOUNT_COPY.confirmLabel),
      "DELETE",
    );
    await userEvent.press(
      screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.button }),
    );
    expect(
      await screen.findByText(DELETE_ACCOUNT_COPY.failed),
    ).toBeOnTheScreen();
    expect(mockEndLocalSession).not.toHaveBeenCalled();
  });
});

describe("Sign up", () => {
  async function fill() {
    await userEvent.type(screen.getByLabelText("Username"), "new_user");
    await userEvent.type(screen.getByLabelText("Email"), "new@example.test");
    await userEvent.type(screen.getByLabelText("Password"), "a-long-Passw0rd");
    await userEvent.press(
      screen.getByRole("button", { name: "Create account" }),
    );
  }

  it("stops before creating the account when the name is taken", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    await open("/sign-up");
    await fill();
    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.usernameTaken]),
    ).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("never reads a failed availability check as available", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "down" } });
    await open("/sign-up");
    await fill();
    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.signUpUnavailable]),
    ).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("creates the account, then claims the name through the API", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockSignUp.mockResolvedValue({
      data: { session: { access_token: "t" }, user: { identities: [{}] } },
      error: null,
    });
    mockApi.on("PUT", PROFILE, () => ({ ok: true, changed: true }));
    await open("/sign-up");
    await fill();
    await waitFor(() =>
      expect(mockApi.callsTo("PUT", PROFILE)[0]?.body).toEqual({
        username: "new_user",
      }),
    );
    expect(mockSignUp).toHaveBeenCalledWith({
      email: "new@example.test",
      password: "a-long-Passw0rd",
    });
  });

  it("offers Sign in instead for an address that already has an account", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockSignUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "user_already_exists", status: 422 },
    });
    await open("/sign-up");
    await fill();
    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.alreadyRegistered]),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Sign in instead" }),
    ).toBeOnTheScreen();
    expect(mockApi.callsTo("PUT", PROFILE)).toEqual([]);
  });
});
