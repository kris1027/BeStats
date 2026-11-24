import { failure, success } from "@bestats/core/auth/action-state";
import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  CHANGE_PASSWORD_COPY,
} from "@bestats/core/auth/messages";
import type { QueryClient } from "@tanstack/react-query";
import { screen, userEvent } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "@/components/text";
import { AccountScreen } from "@/screens/account-screen";
import { ChangePasswordScreen } from "@/screens/change-password-screen";
import {
  createApiMock,
  testQueryClient,
  titleWrapper,
} from "@/test-utils/title-harness";

/**
 * covers: prompts/mobile-look-account.md, decision 3 (Change password is a
 * row on Account only for an account with an email password, pushing its own
 * screen; success goes back with the toast, a refusal stays under its
 * field), spec 0005, AC-16, and AGENTS.md section 11 (no false success).
 */
const mockApi = createApiMock();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiRequest: (...args: [string, unknown, Record<string, unknown>]) =>
    mockApi.handle(...args),
}));

let mockSession: object | null = null;
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: mockSession,
    loading: false,
    signOut: jest.fn(),
    endLocalSession: jest.fn(),
    clearNotice: () => {},
  }),
}));

const mockChangePassword = jest.fn();
jest.mock("@/lib/password", () => ({
  changePassword: (input: unknown) => mockChangePassword(input),
}));

const PROFILE = "/api/v1/me/profile";
let client: QueryClient;

function signedIn(providers: string[]) {
  return {
    user: {
      email: "a@example.test",
      identities: providers.map((provider) => ({ provider })),
    },
  };
}

async function open(url: string) {
  await renderRouter(
    {
      account: () => <AccountScreen />,
      "account/password": ChangePasswordScreen,
      "account/delete": () => <Text>Delete screen</Text>,
      "sign-in": () => <Text>Sign in screen</Text>,
    },
    { initialUrl: url, wrapper: titleWrapper(client) },
  );
}

async function fill() {
  await userEvent.type(
    screen.getByLabelText(CHANGE_PASSWORD_COPY.currentLabel),
    "old-Passw0rd",
  );
  await userEvent.type(
    screen.getByLabelText(CHANGE_PASSWORD_COPY.newLabel),
    "a-new-Passw0rd",
  );
  await userEvent.type(
    screen.getByLabelText(CHANGE_PASSWORD_COPY.confirmLabel),
    "a-new-Passw0rd",
  );
  await userEvent.press(
    screen.getByRole("button", { name: CHANGE_PASSWORD_COPY.button }),
  );
}

beforeEach(() => {
  client = testQueryClient();
  mockApi.reset();
  jest.clearAllMocks();
  mockSession = signedIn(["email"]);
  mockApi.on("GET", PROFILE, () => ({
    username: "tester_one",
    usernameChangeableAt: null,
  }));
});

describe("Account's Change password row", () => {
  it("opens Change password for an account with an email password", async () => {
    await open("/account");
    await userEvent.press(
      await screen.findByRole("button", { name: CHANGE_PASSWORD_COPY.heading }),
    );
    expect(
      await screen.findByLabelText(CHANGE_PASSWORD_COPY.currentLabel),
    ).toBeOnTheScreen();
  });

  it("is left out for an account with no password", async () => {
    mockSession = signedIn(["google"]);
    await open("/account");
    expect(await screen.findByText("tester_one")).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: CHANGE_PASSWORD_COPY.heading }),
    ).toBeNull();
  });
});

describe("Change password", () => {
  it("goes back with the toast once Supabase accepted it", async () => {
    mockChangePassword.mockResolvedValue(success(CHANGE_PASSWORD_COPY.changed));
    await open("/account");
    await userEvent.press(
      await screen.findByRole("button", { name: CHANGE_PASSWORD_COPY.heading }),
    );
    await screen.findByLabelText(CHANGE_PASSWORD_COPY.currentLabel);
    await fill();
    expect(
      await screen.findByText(CHANGE_PASSWORD_COPY.changed),
    ).toBeOnTheScreen();
    expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: "old-Passw0rd",
      password: "a-new-Passw0rd",
      confirmPassword: "a-new-Passw0rd",
    });
    expect(
      screen.queryByLabelText(CHANGE_PASSWORD_COPY.currentLabel),
    ).toBeNull();
  });

  it("shows a wrong current password under its field and stays", async () => {
    mockChangePassword.mockResolvedValue(
      failure(AUTH_OUTCOME.wrongCurrentPassword, ["currentPassword"]),
    );
    await open("/account/password");
    await fill();
    const words = AUTH_MESSAGES[AUTH_OUTCOME.wrongCurrentPassword];
    // Said once, under the field, not again as a form alert.
    expect(await screen.findAllByText(words)).toHaveLength(1);
    expect(screen.queryByText(CHANGE_PASSWORD_COPY.changed)).toBeNull();
    expect(
      screen.getByLabelText(CHANGE_PASSWORD_COPY.currentLabel),
    ).toBeOnTheScreen();
  });

  it("shows a refusal that belongs to no field above the button", async () => {
    mockChangePassword.mockResolvedValue(failure(AUTH_OUTCOME.rateLimited));
    await open("/account/password");
    await fill();
    expect(
      await screen.findByText(AUTH_MESSAGES[AUTH_OUTCOME.rateLimited]),
    ).toBeOnTheScreen();
  });

  it("asks you to sign in when there is no session", async () => {
    mockSession = null;
    await open("/account/password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeOnTheScreen();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });
});
