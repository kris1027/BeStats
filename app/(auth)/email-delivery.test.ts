import { AuthApiError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_STATE } from "@/lib/auth/action-state";
import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  RECOVERY_UNAVAILABLE_MESSAGE,
} from "@/lib/auth/messages";

/**
 * The Auth server is the boundary, so the request scoped client is the one
 * thing replaced, as in `actions.test.ts`.
 */
const auth = {
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
};

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const {
  requestPasswordResetAction,
  resendConfirmationAction,
  signInAction,
  signUpAction,
} = await import("./actions");

const ADDRESS = "someone@example.com";
const PASSWORD = "a-long-enough-password";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const thrown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(thrown).toBeInstanceOf(RedirectSignal);
  return (thrown as RedirectSignal).url;
}

const SESSION = { access_token: "x", refresh_token: "y" };
const NEW_USER = { id: "user-a", identities: [{ id: "identity" }] };

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createClient.mockResolvedValue({ auth });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  warn.mockRestore();
});

/**
 * covers: spec 0018, AC-11, AC-12
 *
 * Production sends no email, so sign up signs people in directly. Whether it
 * does comes from what Supabase returned, never from the flag alone, so a flag
 * and a hosted config that disagree can never fake a success.
 */
describe("signUpAction with email delivery off", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "off");
  });

  it("signs in and goes to the validated next path when Supabase returns a session", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: NEW_USER, session: SESSION },
      error: null,
    });

    const url = await redirectOf(
      signUpAction(
        IDLE_STATE,
        form({ email: ADDRESS, password: PASSWORD, next: "/watchlist" }),
      ),
    );

    expect(url).toBe("/watchlist");
    expect(auth.signUp).toHaveBeenCalledWith({
      email: ADDRESS,
      password: PASSWORD,
      options: undefined,
    });
  });

  it("falls back to /shows when next is missing or unsafe", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: NEW_USER, session: SESSION },
      error: null,
    });

    const url = await redirectOf(
      signUpAction(
        IDLE_STATE,
        form({
          email: ADDRESS,
          password: PASSWORD,
          next: "https://evil.example",
        }),
      ),
    );

    expect(url).toBe("/shows");
  });

  it("says an existing address already has an account, with a sign in link carrying next", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("exists", 422, "user_already_exists"),
    });

    const state = await signUpAction(
      IDLE_STATE,
      form({ email: ADDRESS, password: PASSWORD, next: "/watchlist" }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toBe("An account with this email already exists.");
    expect(state.link).toEqual({
      href: "/sign-in?next=%2Fwatchlist",
      label: "Sign in instead",
    });
    expect(state.values?.email).toBe(ADDRESS);
  });

  it("treats the empty identities shape as an existing address too", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: "user-a", identities: [] }, session: null },
      error: null,
    });

    const state = await signUpAction(
      IDLE_STATE,
      form({ email: ADDRESS, password: PASSWORD }),
    );

    expect(state.outcome).toBe(AUTH_OUTCOME.alreadyRegistered);
  });

  it("refuses plainly, never routing to /check-email, when Supabase returns no session and no error", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: NEW_USER, session: null },
      error: null,
    });

    const state = await signUpAction(
      IDLE_STATE,
      form({ email: ADDRESS, password: PASSWORD }),
    );

    expect(state.message).toBe(
      "Sign up is unavailable right now. Please try again later.",
    );
    // The mismatch is logged as a class, never with the address.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(AUTH_OUTCOME.signUpUnavailable),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(ADDRESS);
  });
});

/** covers: spec 0005, AC-1, AC-2; spec 0018, AC-12 (the `on` path is unchanged) */
describe("signUpAction with email delivery on", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "on");
  });

  it("lands a new address on /check-email and passes the callback link", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: NEW_USER, session: null },
      error: null,
    });

    const url = await redirectOf(
      signUpAction(IDLE_STATE, form({ email: ADDRESS, password: PASSWORD })),
    );

    expect(url).toBe(
      `/check-email?email=${encodeURIComponent(ADDRESS)}&next=%2Fshows`,
    );
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(
      "http://localhost:3000/auth/callback?next=%2Fshows",
    );
  });

  it("masks an existing address the same way", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("exists", 422, "user_already_exists"),
    });

    const url = await redirectOf(
      signUpAction(IDLE_STATE, form({ email: ADDRESS, password: PASSWORD })),
    );

    expect(url).toContain("/check-email?");
  });
});

/**
 * covers: spec 0018, AC-13
 *
 * Posted to directly, the email actions must refuse before any Supabase call,
 * because the cloud project could still send a message through its built in
 * mailer.
 */
describe("the email actions with email delivery off", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "off");
  });

  it("refuses a resend without calling Supabase", async () => {
    const state = await resendConfirmationAction(
      IDLE_STATE,
      form({ email: ADDRESS }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toBe(RECOVERY_UNAVAILABLE_MESSAGE);
    expect(createClient).not.toHaveBeenCalled();
    expect(auth.resend).not.toHaveBeenCalled();
  });

  it("refuses a reset request without calling Supabase", async () => {
    const state = await requestPasswordResetAction(
      IDLE_STATE,
      form({ email: ADDRESS }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toBe(RECOVERY_UNAVAILABLE_MESSAGE);
    expect(createClient).not.toHaveBeenCalled();
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("tells an unconfirmed account to write in, with no resend offer", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("not confirmed", 400, "email_not_confirmed"),
    });

    const state = await signInAction(
      IDLE_STATE,
      form({ email: ADDRESS, password: PASSWORD }),
    );

    expect(state.outcome).toBe(AUTH_OUTCOME.accountNotReady);
    expect(state.message).toMatch(
      /^This account can't sign in yet\. Write to /,
    );
  });
});

/**
 * covers: spec 0018, AC-18 (runtime half)
 *
 * In production the `token_refresh` bucket limits every password sign in and
 * may be shared by every visitor, so a drained bucket must read as "wait",
 * never as wrong details that would send someone to reset a good password.
 */
describe("signInAction once the sign in bucket is drained", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "off");
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError(
        "Request rate limit reached",
        429,
        "over_request_rate_limit",
      ),
    });
  });

  it("shows the rate limited copy", async () => {
    const state = await signInAction(
      IDLE_STATE,
      form({ email: ADDRESS, password: PASSWORD }),
    );

    expect(state.outcome).toBe(AUTH_OUTCOME.rateLimited);
    expect(state.message).toBe(
      "You have reached the limit for now. Please wait a little and try again.",
    );
  });

  it("does not claim the details were wrong", async () => {
    const state = await signInAction(
      IDLE_STATE,
      form({ email: ADDRESS, password: PASSWORD }),
    );

    expect(state.message).not.toBe(
      AUTH_MESSAGES[AUTH_OUTCOME.invalidCredentials],
    );
  });

  it("keeps the typed address and logs the outcome without it", async () => {
    const state = await signInAction(
      IDLE_STATE,
      form({ email: ADDRESS, password: PASSWORD }),
    );

    expect(state.values?.email).toBe(ADDRESS);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(ADDRESS);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(PASSWORD);
  });
});

/** covers: spec 0005, AC-6, AC-7 (the `on` path is unchanged) */
describe("the email actions with email delivery on", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "on");
  });

  it("sends a reset link", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const state = await requestPasswordResetAction(
      IDLE_STATE,
      form({ email: ADDRESS }),
    );

    expect(state.status).toBe("success");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledOnce();
  });

  it("sends a confirmation link again", async () => {
    auth.resend.mockResolvedValue({ data: {}, error: null });

    const state = await resendConfirmationAction(
      IDLE_STATE,
      form({ email: ADDRESS }),
    );

    expect(state.status).toBe("success");
    expect(auth.resend).toHaveBeenCalledOnce();
  });

  it("keeps the unconfirmed outcome that offers a resend", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("not confirmed", 400, "email_not_confirmed"),
    });

    const state = await signInAction(
      IDLE_STATE,
      form({ email: ADDRESS, password: PASSWORD }),
    );

    expect(state.message).toBe(AUTH_MESSAGES[AUTH_OUTCOME.emailNotConfirmed]);
  });
});
