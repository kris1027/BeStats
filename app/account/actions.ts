"use server";

import {
  type AuthActionState,
  failure,
  fromZodError,
  passwordFieldFor,
  success,
} from "@/lib/auth/action-state";
import { AUTH_EVENT, logAuthEvent } from "@/lib/auth/log";
import { AUTH_OUTCOME } from "@/lib/auth/messages";
import { changePasswordSchema } from "@/lib/auth/schemas";
import { classifyAuthError } from "@/lib/auth/supabase-error";
import { getOptionalUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

/**
 * Changes the signed in account's password (spec 0005, AC-16, AC-17).
 *
 * The current password is required and checked by attempting a sign in with it.
 * That is deliberate on two counts: Supabase's `updateUser` does not verify the
 * old password on its own, so without this anyone who reached an unlocked
 * browser could take the account over; and routing the check through
 * `signInWithPassword` puts it in the same rate limit bucket as sign in, so
 * repeated guessing at the current password is limited too.
 *
 * The session is resolved through `getOptionalUser()` rather than trusting the
 * page that rendered the form. A session can be revoked between render and
 * submit, and AC-17 requires that case to write nothing and say so, not to show
 * a success state for a write that never happened.
 */
export async function changePasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    logAuthEvent(
      AUTH_EVENT.changePassword,
      "refused",
      AUTH_OUTCOME.invalidInput,
    );
    return fromZodError(parsed.error);
  }

  const user = await getOptionalUser();

  if (!user) {
    logAuthEvent(
      AUTH_EVENT.changePassword,
      "refused",
      AUTH_OUTCOME.sessionExpired,
    );

    // Returned, not thrown, and not redirected. A redirect from an action used
    // with `useActionState` is re-issued as a POST against the destination
    // route, which does not own this action, so the response is rejected and
    // the person sees a blank page.
    //
    // This branch only renders at all because the proxy no longer redirects a
    // Server Action POST: it used to answer this request with a redirect, which
    // replaced the page with a raw payload and showed nothing. See `proxy.ts`.
    return failure(AUTH_OUTCOME.sessionExpired);
  }

  const supabase = await createClient();

  const { error: currentPasswordError } =
    await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    });

  if (currentPasswordError) {
    const outcome = classifyAuthError(currentPasswordError);
    logAuthEvent(AUTH_EVENT.changePassword, "refused", outcome);
    // Only a credentials refusal means the password was wrong. A rate limit or
    // an outage keeps its own message and does not mark the field, so the
    // person is never told a correct password is wrong.
    return outcome === AUTH_OUTCOME.invalidCredentials
      ? failure(AUTH_OUTCOME.wrongCurrentPassword, ["currentPassword"])
      : failure(outcome);
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    const outcome = classifyAuthError(error);
    logAuthEvent(AUTH_EVENT.changePassword, "refused", outcome);
    return failure(outcome, passwordFieldFor(outcome));
  }

  return success("Your password has been changed.");
}
