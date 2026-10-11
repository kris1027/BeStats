"use server";

import { refresh } from "next/cache";

import {
  type AuthActionState,
  failure,
  fromZodError,
  keepUsername,
  passwordFieldFor,
  success,
} from "@/lib/auth/action-state";
import { AUTH_EVENT, logAuthEvent } from "@/lib/auth/log";
import {
  AUTH_OUTCOME,
  USERNAME_UNCHANGED_MESSAGE,
  USERNAME_UPDATED_MESSAGE,
} from "@/lib/auth/messages";
import { getOwnProfile } from "@/lib/auth/profile";
import { changePasswordSchema, changeUsernameSchema } from "@/lib/auth/schemas";
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

/**
 * Sets or changes the signed in account's username
 * (prompts/account-username.md, Q6, Q13).
 *
 * One upsert, and the database decides the rest: the trigger on `profiles`
 * refuses a change inside the week, treats the identical name as no change,
 * and stamps the time itself; the checks and the unique index refuse a bad,
 * reserved or taken name. Deciding the lock here as well would only add a
 * second clock to disagree with the first.
 *
 * The session is resolved here, not trusted from the page, as in
 * `changePasswordAction`, and the user id comes only from it. On success
 * `refresh()` re-renders the page and the navbar with the new name.
 */
export async function changeUsernameAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = changeUsernameSchema.safeParse({
    username: formData.get("username"),
  });

  if (!parsed.success) {
    logAuthEvent(
      AUTH_EVENT.changeUsername,
      "refused",
      AUTH_OUTCOME.invalidInput,
    );
    // A reserved name fails here with the taken message, so it is reported
    // as taken, not as a highlighted field to fix.
    return keepUsername(fromZodError(parsed.error), formData);
  }

  const user = await getOptionalUser();

  if (!user) {
    logAuthEvent(
      AUTH_EVENT.changeUsername,
      "refused",
      AUTH_OUTCOME.sessionExpired,
    );
    return failure(AUTH_OUTCOME.sessionExpired);
  }

  // The identical name is no change, and the trigger would keep the clock
  // where it was. Saying "updated" for it would be a small lie.
  const current = await getOwnProfile();
  if (current?.username === parsed.data.username) {
    return keepUsername(success(USERNAME_UNCHANGED_MESSAGE), formData);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { user_id: user.id, username: parsed.data.username },
      { onConflict: "user_id" },
    );

  if (error) {
    const outcome = usernameWriteOutcome(error);
    logAuthEvent(AUTH_EVENT.changeUsername, "refused", outcome);
    return keepUsername(
      failure(
        outcome,
        outcome === AUTH_OUTCOME.usernameTaken ? ["username"] : [],
      ),
      formData,
    );
  }

  refresh();
  return success(USERNAME_UPDATED_MESSAGE);
}

/**
 * Maps a refused `profiles` write to what the person is told. Matches on the
 * SQLSTATE and the trigger's own message, never on free text Postgres writes.
 */
function usernameWriteOutcome(error: { code?: string; message?: string }) {
  // 23505: the unique index. 23514: the reserved list (the format is caught
  // by Zod first, so a check failure here is a reserved name in practice).
  if (error.code === "23505" || error.code === "23514") {
    return AUTH_OUTCOME.usernameTaken;
  }
  if (error.code === "P0001" && error.message === "username_locked") {
    return AUTH_OUTCOME.usernameLocked;
  }
  return AUTH_OUTCOME.unexpected;
}
