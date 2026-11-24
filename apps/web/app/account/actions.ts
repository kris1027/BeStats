"use server";

import { v1AccountDeleteBodySchema } from "@bestats/core/api/v1/account";
import {
  type AuthActionState,
  failure,
  fromZodError,
  keepUsername,
  passwordFieldFor,
  success,
} from "@bestats/core/auth/action-state";
import {
  AUTH_OUTCOME,
  CHANGE_PASSWORD_COPY,
  DELETE_ACCOUNT_COPY,
  USERNAME_UNCHANGED_MESSAGE,
  USERNAME_UPDATED_MESSAGE,
} from "@bestats/core/auth/messages";
import {
  changePasswordSchema,
  changeUsernameSchema,
} from "@bestats/core/auth/schemas";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { deleteOwnAccountCommand } from "@/lib/auth/commands/account";
import { changeUsernameCommand } from "@/lib/auth/commands/username";
import { AUTH_EVENT, logAuthEvent } from "@/lib/auth/log";
import { getOwnProfile } from "@/lib/auth/profile";
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
    confirmPassword: formData.get("confirmPassword"),
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

  return success(CHANGE_PASSWORD_COPY.changed);
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

  // The command answers the identical name as unchanged with no write; the
  // name it compares with is the request's cached profile read.
  const current = await getOwnProfile();
  const result = await changeUsernameCommand(
    { userId: user.id, getClient: createClient },
    { username: parsed.data.username, current: current?.username ?? null },
  );

  if (!result.ok) {
    logAuthEvent(AUTH_EVENT.changeUsername, "refused", result.error);
    return keepUsername(
      failure(
        result.error,
        result.error === AUTH_OUTCOME.usernameTaken ? ["username"] : [],
      ),
      formData,
    );
  }

  if (!result.changed) {
    return keepUsername(success(USERNAME_UNCHANGED_MESSAGE), formData);
  }

  refresh();
  return success(USERNAME_UPDATED_MESSAGE);
}

/**
 * Deletes the signed in account from `/account` (spec 0033, child 0036;
 * AC-12), through the same command as `POST /api/v1/me/account/delete`.
 *
 * The typed word is checked again here with the route's own schema, so a
 * direct post without it deletes nothing. The session is resolved here, never
 * trusted from the page, and `delete_own_account()` takes no argument, so the
 * account that goes is always the caller's. Only after Postgres confirms does
 * it sign out and leave; a failure stays on the page with the "still here"
 * copy and the session intact (AGENTS.md section 11).
 */
export async function deleteAccountAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = v1AccountDeleteBodySchema.safeParse({
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    logAuthEvent(
      AUTH_EVENT.deleteAccount,
      "refused",
      AUTH_OUTCOME.invalidInput,
    );
    return {
      ...failure(AUTH_OUTCOME.invalidInput),
      message: DELETE_ACCOUNT_COPY.confirmLabel,
    };
  }

  const user = await getOptionalUser();
  if (!user) {
    logAuthEvent(
      AUTH_EVENT.deleteAccount,
      "refused",
      AUTH_OUTCOME.sessionExpired,
    );
    return failure(AUTH_OUTCOME.sessionExpired);
  }

  const result = await deleteOwnAccountCommand({
    userId: user.id,
    getClient: createClient,
  });
  if (!result.ok) {
    logAuthEvent(AUTH_EVENT.deleteAccount, "error", result.error);
    return { ...failure(result.error), message: DELETE_ACCOUNT_COPY.failed };
  }

  // The auth row is gone, so the server may refuse to end the session; the
  // local cookies are cleared either way, which is the end state wanted.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/shows");
}
