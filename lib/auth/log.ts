import "server-only";

import type { AuthOutcome } from "./messages";

/**
 * The only way an auth path is allowed to write to the log (spec 0005, AC-19).
 *
 * AC-19 says no log line may carry a password, a token, a cookie value or a
 * confirmation link. Reviewing every `console.warn` for that is how it gets
 * broken six features later, so the rule is made structural instead: this
 * module accepts an event name and an outcome class and nothing else. There is
 * no parameter a caller could pass a secret through, which is why the raw
 * Supabase error object is never accepted here. That object routinely carries
 * the offending value in its message.
 *
 * Deliberately no address either. An access log of who tried to sign in is
 * personal data this app has no use for (`AGENTS.md` section 11).
 */
export const AUTH_EVENT = {
  signUp: "auth.sign_up",
  resendConfirmation: "auth.resend_confirmation",
  signIn: "auth.sign_in",
  signOut: "auth.sign_out",
  requestPasswordReset: "auth.request_password_reset",
  resetPassword: "auth.reset_password",
  changePassword: "auth.change_password",
  callback: "auth.callback",
  guard: "auth.guard",
} as const;

export type AuthEvent = (typeof AUTH_EVENT)[keyof typeof AUTH_EVENT];

/** Whether the attempt did what the person asked. */
type AuthResult = "ok" | "refused" | "error";

/**
 * Records one auth attempt.
 *
 * Only failures and refusals reach the log at warn level; a successful sign in
 * is not interesting enough to fill a log with, matching the failure only rule
 * `lib/tmdb/client.ts` already follows.
 *
 * @param event Which auth path ran.
 * @param result Whether it succeeded, was refused, or broke.
 * @param outcome The classified reason, when there was one. Never free text.
 */
export function logAuthEvent(
  event: AuthEvent,
  result: AuthResult,
  outcome?: AuthOutcome,
): void {
  if (result === "ok") return;

  console.warn(JSON.stringify({ event, result, outcome: outcome ?? null }));
}
