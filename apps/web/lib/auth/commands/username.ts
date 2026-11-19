import "server-only";

import type { UsernameWriteError } from "@bestats/core/api/v1/profile";
import { AUTH_OUTCOME } from "@bestats/core/auth/messages";

import type { TrackingDeps } from "@/lib/tracking/commands/run";

import { classifyProfileWriteError } from "../supabase-error";

/**
 * The username reads and writes shared by the web's auth Server Actions and
 * `/api/v1/me/profile` (spec 0035, Mapping to actions), so a username written
 * from a phone passes exactly the steps one written on the web does (spec
 * 0033, AC-5). Each takes the caller's verified user and RLS bound client in
 * `deps` (the cookie pair from an action, the bearer pair from a route) and
 * never reads cookies, headers or the session itself.
 *
 * None throws or logs: each returns what happened, and the caller logs it
 * under its own event, so the sign up and account actions keep their log
 * lines. The database is the judge of uniqueness, the reserved list and the
 * weekly lock (`guard_username_change`, `BS002`).
 */

/** A `profiles` row as the callers use it. */
export type ProfileRow = { username: string; usernameChangedAt: Date };

/**
 * Reads the caller's own `profiles` row. `null` means none yet (unclaimed);
 * `failed` a read error, kept apart so a caller never mistakes an outage for
 * an unclaimed name (AGENTS.md section 11). RLS limits the read to the
 * caller's own row; the `user_id` filter only lets it use the primary key.
 */
export async function readProfileRow(
  deps: TrackingDeps,
): Promise<{ ok: true; row: ProfileRow | null } | { ok: false }> {
  try {
    const supabase = await deps.getClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("username, username_changed_at")
      .eq("user_id", deps.userId)
      .maybeSingle();
    if (error) return { ok: false };
    if (!data) return { ok: true, row: null };
    return {
      ok: true,
      row: {
        username: data.username,
        usernameChangedAt: new Date(data.username_changed_at),
      },
    };
  } catch {
    return { ok: false };
  }
}

type WriteResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: UsernameWriteError };

/** Maps a profile write error to the refusal the actions already name. */
function refusal(error: { code?: string | null }): {
  ok: false;
  error: UsernameWriteError;
} {
  const outcome = classifyProfileWriteError(error);
  return {
    ok: false,
    error:
      outcome === AUTH_OUTCOME.usernameTaken ||
      outcome === AUTH_OUTCOME.usernameLocked
        ? outcome
        : AUTH_OUTCOME.unexpected,
  };
}

/**
 * Claims a first username by inserting the `profiles` row: the step after
 * sign up on the web (`signUpAction`) and on the phone (`PUT /me/profile`
 * while the caller has no row; prompts/account-username.md). An insert, not
 * an upsert, so it can never rename an existing account. A name taken in
 * between is `username_taken`; the account itself already exists.
 */
export async function claimUsernameCommand(
  deps: TrackingDeps,
  input: { username: string },
): Promise<WriteResult> {
  try {
    const supabase = await deps.getClient();
    const { error } = await supabase
      .from("profiles")
      .insert({ user_id: deps.userId, username: input.username });
    return error ? refusal(error) : { ok: true, changed: true };
  } catch {
    return { ok: false, error: AUTH_OUTCOME.unexpected };
  }
}

/**
 * Sets the username from the account screen (`changeUsernameAction`, and
 * `PUT /me/profile` when a row exists). The caller passes the name it read,
 * so the identical name is answered as unchanged with no write: the trigger
 * would keep the clock where it was, and saying "updated" would be a small
 * lie. An upsert, since an account whose sign up never claimed a name picks
 * one here too; the weekly lock (`BS002`) is `username_locked`.
 */
export async function changeUsernameCommand(
  deps: TrackingDeps,
  input: { username: string; current: string | null },
): Promise<WriteResult> {
  if (input.current === input.username) return { ok: true, changed: false };
  try {
    const supabase = await deps.getClient();
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { user_id: deps.userId, username: input.username },
        { onConflict: "user_id" },
      );
    return error ? refusal(error) : { ok: true, changed: true };
  } catch {
    return { ok: false, error: AUTH_OUTCOME.unexpected };
  }
}
