import type { z } from "zod";

import { AUTH_OUTCOME, type AuthOutcome, authMessage } from "./messages";

/**
 * The one shape every auth Server Action returns (spec 0005, API surface).
 *
 * Actions return this rather than throwing, because a thrown error in a Server
 * Action reaches the browser as an opaque digest in production: the form could
 * then only say "something went wrong", which is not enough for AC-6 (offer a
 * resend path) or AC-17 (offer a sign in link). A returned object carries the
 * classified outcome intact.
 *
 * `fieldErrors` is what lets a form point `aria-describedby` at the message for
 * the field it belongs to, which is how AC-21 is satisfied without each form
 * inventing its own error plumbing.
 */
export type AuthField = "email" | "password" | "currentPassword";

export type AuthActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
  /**
   * The classified reason, so a form can render an extra affordance for a
   * specific case (the resend link on an unconfirmed address, the sign in link
   * on an expired session) without string matching the message.
   */
  outcome?: AuthOutcome;
  /**
   * What was typed into the email field, handed back so the form can use it as
   * `defaultValue`. React 19 resets a form's uncontrolled inputs once its
   * action finishes, so without this every refusal empties the field. Only the
   * email is ever carried; a password must never travel back to the page.
   */
  values?: { email?: string };
};

/** The state a form starts in, before anything has been submitted. */
export const IDLE_STATE: AuthActionState = { status: "idle" };

/**
 * An error state built from a classified outcome.
 *
 * The copy always comes from `lib/auth/messages.ts`, never from the caller, so
 * the neutral wording cannot drift between forms.
 *
 * @param outcome Which classified failure happened.
 * @param fields Which inputs the failure belongs to, if any. Each is marked
 * with the same message, which is what lets the form point
 * `aria-describedby` at it (AC-21). A failure that belongs to no single input,
 * such as a rate limit, passes none.
 */
export function failure(
  outcome: AuthOutcome,
  fields: AuthField[] = [],
): AuthActionState {
  const message = authMessage(outcome);
  const fieldErrors: Partial<Record<AuthField, string>> = {};
  for (const field of fields) fieldErrors[field] = message;

  return {
    status: "error",
    message,
    outcome,
    fieldErrors: fields.length > 0 ? fieldErrors : undefined,
  };
}

/**
 * Whether a password rule failure should be attached to the password input.
 *
 * Only the two rule failures belong to the field. A rate limit or an outage
 * does not, and marking the input for those would tell the person their
 * password is wrong when it is not. Shared by every action that sets a
 * password, so the rule cannot drift between them.
 */
export function passwordFieldFor(outcome: AuthOutcome): AuthField[] {
  return outcome === AUTH_OUTCOME.passwordTooShort ||
    outcome === AUTH_OUTCOME.passwordBreached
    ? ["password"]
    : [];
}

/**
 * A success state with copy the caller chooses.
 *
 * Success copy is the one place a caller writes its own string, because the
 * neutral confirmations differ per surface and both already live as named
 * constants in `lib/auth/messages.ts`.
 */
export function success(message: string): AuthActionState {
  return { status: "success", message };
}

/**
 * Carries the submitted email on a state, so the form keeps it after React
 * resets the inputs (see `AuthActionState.values`).
 *
 * The raw submission is kept, not the parsed value, so an address that failed
 * validation stays on screen for the person to correct.
 */
export function keepEmail(
  state: AuthActionState,
  formData: FormData,
): AuthActionState {
  const email = formData.get("email");
  return typeof email === "string" ? { ...state, values: { email } } : state;
}

/**
 * Turns a Zod failure into the field level messages a form can render.
 *
 * Only the first issue per field is kept: a list of three messages under one
 * input is noise, and the first is the one the person needs to fix first.
 *
 * @param error The Zod error from a failed `safeParse`.
 * @returns An error state carrying one message per offending field.
 */
export function fromZodError(error: z.ZodError): AuthActionState {
  const fieldErrors: Partial<Record<AuthField, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      (field === "email" ||
        field === "password" ||
        field === "currentPassword") &&
      !fieldErrors[field]
    ) {
      fieldErrors[field] = issue.message;
    }
  }

  return {
    status: "error",
    message: authMessage(AUTH_OUTCOME.invalidInput),
    outcome: AUTH_OUTCOME.invalidInput,
    fieldErrors,
  };
}
