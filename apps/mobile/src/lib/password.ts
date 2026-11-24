import {
  type AuthActionState,
  failure,
  fromZodError,
  success,
} from "@bestats/core/auth/action-state";
import {
  AUTH_OUTCOME,
  CHANGE_PASSWORD_COPY,
} from "@bestats/core/auth/messages";
import { changePasswordSchema } from "@bestats/core/auth/schemas";
import type { Database } from "@bestats/core/supabase/database.types";
import { createClient } from "@supabase/supabase-js";

import { authErrorOutcome, newPasswordFailure } from "./auth-errors";
import { getPublicEnv } from "./env";
import { getSupabase } from "./supabase";

/**
 * The storage key of the throwaway client, apart from the app's own
 * (`SESSION_STORAGE_KEY`), so the two never share a slot even though this one
 * stores nothing.
 */
const CHECK_STORAGE_KEY = "bestats-password-check";

/**
 * Changes the signed in account's password from the phone
 * (prompts/mobile-look-account.md, decisions 1 and 2), the web's
 * `changePasswordAction` with the requests going straight to Supabase Auth.
 *
 * `updateUser` does not verify the old password, so the current one is
 * checked first by signing in with it, as on the web, which also puts guesses
 * in sign in's rate limit. That sign in runs on a second client that keeps no
 * session and refreshes nothing: the app's own session is never replaced
 * (the reason this waited until 5d1 was done), and the check's session is
 * revoked with `scope: "local"` in a `finally`, so it never lingers. Never
 * `scope: "global"` there: that would end every session, the app's too.
 *
 * Returns core's `AuthActionState`, so each refusal marks the field it
 * belongs to exactly as the web does, and success is said only after Supabase
 * accepted the new password (AGENTS.md section 11). No password is logged or
 * kept.
 */
export async function changePassword(input: {
  currentPassword: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthActionState> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const app = getSupabase();
  let email: string | undefined;
  try {
    const { data } = await app.auth.getSession();
    email = data.session?.user.email;
  } catch {
    return failure(AUTH_OUTCOME.unexpected);
  }
  if (!email) return failure(AUTH_OUTCOME.sessionExpired);

  const env = getPublicEnv();
  const checker = createClient<Database>(
    env.EXPO_PUBLIC_SUPABASE_URL,
    env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: CHECK_STORAGE_KEY,
      },
    },
  );

  try {
    const { error } = await checker.auth.signInWithPassword({
      email,
      password: parsed.data.currentPassword,
    });
    if (error) {
      const outcome = authErrorOutcome(error);
      // Only a credentials refusal means the password was wrong. A rate limit
      // or an outage keeps its own words and marks no field, so a correct
      // password is never called wrong.
      return outcome === AUTH_OUTCOME.invalidCredentials
        ? failure(AUTH_OUTCOME.wrongCurrentPassword, ["currentPassword"])
        : failure(outcome);
    }
  } catch {
    return failure(AUTH_OUTCOME.unexpected);
  } finally {
    await checker.auth.signOut({ scope: "local" }).catch(() => undefined);
  }

  try {
    const { error } = await app.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) return newPasswordFailure(error);
  } catch {
    return failure(AUTH_OUTCOME.unexpected);
  }
  return success(CHANGE_PASSWORD_COPY.changed);
}
