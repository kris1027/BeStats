"use server";

import { redirect } from "next/navigation";

import {
  type AuthActionState,
  failure,
  fromZodError,
  keepEmail,
  passwordFieldFor,
  success,
} from "@/lib/auth/action-state";
import { isRecoverySession } from "@/lib/auth/identity";
import { AUTH_EVENT, logAuthEvent } from "@/lib/auth/log";
import {
  AUTH_OUTCOME,
  RESEND_REQUESTED_MESSAGE,
  RESET_REQUESTED_MESSAGE,
  SIGN_IN_NOTICE,
} from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";
import {
  emailOnlySchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { classifyAuthError } from "@/lib/auth/supabase-error";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Every authentication mutation, as Server Actions (spec 0005, Decision).
 *
 * The browser never calls Supabase Auth and never holds a token: each form
 * posts here, the request scoped server client does the work, and the session
 * cookie is written server side. A cross site scripting bug therefore cannot
 * read a session out of JavaScript, because there is none there to read.
 *
 * None of these throw. They return `AuthActionState`, because a thrown error in
 * a Server Action reaches the browser as an opaque digest in production, which
 * would collapse every distinct outcome into "something went wrong".
 *
 * A redirect is the exception: `redirect()` throws by design and must not be
 * caught, so it is always called outside any `try`.
 */

/** Where a confirmation or recovery link comes back to. */
function callbackUrl(params: Record<string, string>): string {
  const url = new URL("/auth/callback", getPublicEnv().NEXT_PUBLIC_SITE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * The floor **every** sign up answer is padded to (spec 0005, AC-2).
 *
 * The two branches take visibly different times on their own: a new address
 * sends a message, a taken one is refused immediately. Either way the gap is a
 * membership oracle, so both are held to one floor rather than the fast branch
 * being slowed to meet the slow one.
 *
 * Padding only the taken branch, which is what an earlier version of this did,
 * is worse than not padding at all: measured against the local stack the real
 * path took 193 to 228ms while the padded refusal took 983 to 999ms, so the pad
 * itself became the signal. The floor has to sit above both.
 *
 * This is a pad, not a constant time implementation. It narrows the signal
 * rather than removing it, which is the proportionate answer for a watch
 * tracking app and would not be for something holding money or health data
 * (spec 0005, Consequences). A slower real mail provider can still push the
 * sending branch past this floor; re-measure and raise it if that happens.
 */
const SIGN_UP_PAD_MS = 1200;

async function padTo(startedAt: number, floorMs: number): Promise<void> {
  const remaining = floorMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

/**
 * Creates an unconfirmed account and sends a confirmation link (AC-1, AC-2).
 *
 * Succeeds and fails into the same place. A new address and an address that
 * already has a confirmed account both land on `/check-email`, because the only
 * way not to reveal which one happened is to behave identically. Supabase
 * signals the second case with an empty `identities` array and sends no mail.
 */
export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const startedAt = Date.now();

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    logAuthEvent(AUTH_EVENT.signUp, "refused", AUTH_OUTCOME.invalidInput);
    return keepEmail(fromZodError(parsed.error), formData);
  }

  const { email, password, next } = parsed.data;
  const nextPath = safeNextPath(next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl({ next: nextPath }) },
  });

  // Two ways Supabase reports an address that already has an account, and both
  // must end up somewhere indistinguishable from a new address (AC-2).
  //
  // `user_already_exists` is what the installed version actually returns: a
  // plain 422. The empty `identities` array below is the obfuscated form older
  // and differently configured versions send instead. Both are handled, because
  // which one arrives is a property of the Auth server, not of this code, and
  // treating either as an ordinary error would print "already registered" on
  // the page and hand out a membership oracle.
  const addressAlreadyRegistered =
    error?.code === "user_already_exists" ||
    (!error && data.user?.identities?.length === 0);

  if (error && !addressAlreadyRegistered) {
    const outcome = classifyAuthError(error);
    logAuthEvent(AUTH_EVENT.signUp, "refused", outcome);
    return keepEmail(failure(outcome, passwordFieldFor(outcome)), formData);
  }

  // Both branches, never one. See SIGN_UP_PAD_MS: padding only the refusal
  // makes the refusal the slow one and leaks the answer just as loudly.
  await padTo(startedAt, SIGN_UP_PAD_MS);

  redirect(
    `/check-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`,
  );
}

/**
 * Sends the confirmation link again (AC-1's resend control).
 *
 * Answers the same way whether or not the address needs confirming, for the
 * same reason sign up does.
 */
export async function resendConfirmationAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    logAuthEvent(
      AUTH_EVENT.resendConfirmation,
      "refused",
      AUTH_OUTCOME.invalidInput,
    );
    return keepEmail(fromZodError(parsed.error), formData);
  }

  const nextPath = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl({ next: nextPath }) },
  });

  // A rate limit is the one failure worth surfacing: it is the only one where
  // telling the person to wait is more useful than the neutral confirmation,
  // and it reveals nothing about the address.
  if (error) {
    const outcome = classifyAuthError(error);
    logAuthEvent(AUTH_EVENT.resendConfirmation, "refused", outcome);
    if (outcome === AUTH_OUTCOME.rateLimited)
      return keepEmail(failure(outcome), formData);
  }

  return keepEmail(success(RESEND_REQUESTED_MESSAGE), formData);
}

/**
 * Signs in and lands on the requested path (AC-4, AC-5, AC-6).
 *
 * A wrong password and an unknown address produce one identical message that
 * names neither the address nor the field at fault, so the form cannot be used
 * to discover whether an address is registered here.
 */
export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    logAuthEvent(AUTH_EVENT.signIn, "refused", AUTH_OUTCOME.invalidInput);
    return keepEmail(fromZodError(parsed.error), formData);
  }

  const { email, password, next } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const outcome = classifyAuthError(error);
    logAuthEvent(AUTH_EVENT.signIn, "refused", outcome);
    // The unconfirmed case is the one exception to the neutral rule, and it is
    // safe: reaching it required the correct password, so the person asking
    // already knows the account exists.
    return keepEmail(failure(outcome), formData);
  }

  redirect(safeNextPath(next));
}

/**
 * Ends the session in this browser only (AC-15).
 *
 * `scope: "local"` is passed explicitly rather than relying on the client
 * default, which is `global` and would sign the account out everywhere. Signing
 * someone out of their phone because they closed a tab on their laptop is not
 * what Sign out means here.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    // Sign out is idempotent: an already dead session is the desired end state,
    // so this is recorded and then ignored rather than shown.
    logAuthEvent(AUTH_EVENT.signOut, "error", classifyAuthError(error));
  }

  redirect("/shows");
}

/**
 * Sends a password recovery link (AC-7).
 *
 * Shows the same confirmation whether or not the address has an account. The
 * copy is phrased conditionally, so it reveals nothing and still tells no lie
 * for an address that got no message.
 */
export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    logAuthEvent(
      AUTH_EVENT.requestPasswordReset,
      "refused",
      AUTH_OUTCOME.invalidInput,
    );
    return keepEmail(fromZodError(parsed.error), formData);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: callbackUrl({ type: "recovery" }) },
  );

  if (error) {
    const outcome = classifyAuthError(error);
    logAuthEvent(AUTH_EVENT.requestPasswordReset, "refused", outcome);
    if (outcome === AUTH_OUTCOME.rateLimited)
      return keepEmail(failure(outcome), formData);
  }

  return keepEmail(success(RESET_REQUESTED_MESSAGE), formData);
}

/**
 * Sets a new password from a recovery session (AC-8, AC-24).
 *
 * Requires a session that came from a recovery link, not merely a session. An
 * ordinary signed in session is refused, because this form never asks for the
 * current password; accepting one would let a stolen cookie walk around the
 * check `/account` makes (AC-16). The refusal reuses the session expired
 * outcome, so the form's existing offer of a fresh reset link applies.
 *
 * A successful reset spends the session by signing out globally. `amr` keeps
 * saying `recovery` for the life of the session, so without this one link
 * could set a second password, and a third. Ending every session is also what
 * someone recovering an account wants: it removes anyone else already inside.
 */
export async function resetPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    logAuthEvent(
      AUTH_EVENT.resetPassword,
      "refused",
      AUTH_OUTCOME.invalidInput,
    );
    return fromZodError(parsed.error);
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims?.sub || !isRecoverySession(claims.claims.amr)) {
    logAuthEvent(
      AUTH_EVENT.resetPassword,
      "refused",
      AUTH_OUTCOME.sessionExpired,
    );
    return failure(AUTH_OUTCOME.sessionExpired);
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    const outcome = classifyAuthError(error);
    logAuthEvent(AUTH_EVENT.resetPassword, "refused", outcome);
    return failure(outcome, passwordFieldFor(outcome));
  }

  // The password is already saved, so a failed sign out does not undo the
  // reset. It is recorded rather than shown: telling the person their new
  // password failed would be false.
  const { error: signOutError } = await supabase.auth.signOut({
    scope: "global",
  });
  if (signOutError) {
    logAuthEvent(
      AUTH_EVENT.resetPassword,
      "error",
      classifyAuthError(signOutError),
    );
  }

  redirect(`/sign-in?notice=${SIGN_IN_NOTICE.passwordReset}`);
}
