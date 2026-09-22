/**
 * Every message an auth surface can show, written once (spec 0005, AC-2, AC-5,
 * AC-7).
 *
 * The neutral wording is the whole point. Sign in must not distinguish a wrong
 * password from an address with no account, sign up must not distinguish a new
 * address from a taken one, and a reset request must read the same either way.
 * Those guarantees hold only if the copy lives in one place; the moment a form
 * writes its own string, the two branches drift and the difference becomes an
 * address lookup tool.
 *
 * Nothing here ever names an address or a field at fault.
 */
export const AUTH_OUTCOME = {
  /** Sign in failed. Covers a wrong password and an unknown address alike. */
  invalidCredentials: "invalid_credentials",
  /** The address exists but has never been confirmed. */
  emailNotConfirmed: "email_not_confirmed",
  /** Zod rejected the shape of the input before Supabase saw it. */
  invalidInput: "invalid_input",
  /** Shorter than the minimum length. */
  passwordTooShort: "password_too_short",
  /** Supabase's leaked password check refused it. */
  passwordBreached: "password_breached",
  /** A Supabase rate limit was reached. */
  rateLimited: "rate_limited",
  /** The link in the email is expired, already used, or malformed. */
  invalidLink: "invalid_link",
  /** A write was attempted with no valid session, or one that has expired. */
  sessionExpired: "session_expired",
  /** The current password given on the change password form was wrong. */
  wrongCurrentPassword: "wrong_current_password",
  /** Supabase, or the network to it, failed in a way we cannot classify. */
  unexpected: "unexpected",
} as const;

export type AuthOutcome = (typeof AUTH_OUTCOME)[keyof typeof AUTH_OUTCOME];

/**
 * The copy shown for each outcome.
 *
 * `invalidCredentials` names neither the address nor which field was wrong, so
 * a stranger typing an address into the form learns nothing about whether it is
 * registered here. That is measurably worse for an honest person who mistyped,
 * and it is the price of not shipping a membership oracle (spec 0005,
 * Consequences).
 */
export const AUTH_MESSAGES: Record<AuthOutcome, string> = {
  [AUTH_OUTCOME.invalidCredentials]:
    "Those details did not match an account. Check them and try again.",
  [AUTH_OUTCOME.emailNotConfirmed]:
    "This address still needs confirming. Check your inbox for the link, or send yourself a new one.",
  [AUTH_OUTCOME.invalidInput]: "Check the highlighted fields and try again.",
  [AUTH_OUTCOME.passwordTooShort]: "Your password needs at least 8 characters.",
  [AUTH_OUTCOME.passwordBreached]:
    "This password has appeared in a known data breach, so it cannot be used here. Please choose a different one.",
  [AUTH_OUTCOME.rateLimited]:
    "You have reached the limit for now. Please wait a little and try again.",
  [AUTH_OUTCOME.invalidLink]:
    "That link has expired or has already been used. Please request a new one.",
  [AUTH_OUTCOME.sessionExpired]:
    "Your session has ended, so nothing was saved. Sign in again to continue.",
  [AUTH_OUTCOME.wrongCurrentPassword]: "Your current password is not correct.",
  [AUTH_OUTCOME.unexpected]:
    "Something went wrong on our side. Please try again.",
};

/**
 * The confirmation shown after a password reset request, whether or not the
 * address has an account (spec 0005, AC-7).
 *
 * Deliberately phrased as a conditional (`if ... you will`) rather than a claim
 * that a message was sent, because for an unknown address none was. It tells no
 * lie and still reveals nothing.
 */
export const RESET_REQUESTED_MESSAGE =
  "If that address has an account, a link to set a new password is on its way.";

/** The same neutrality for the resend control on the check email page. */
export const RESEND_REQUESTED_MESSAGE =
  "If that address needs confirming, a new link is on its way.";

/** Looks up the copy for an outcome. */
export function authMessage(outcome: AuthOutcome): string {
  return AUTH_MESSAGES[outcome];
}
