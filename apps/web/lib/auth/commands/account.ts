import "server-only";

import { AUTH_OUTCOME, type AuthOutcome } from "@bestats/core/auth/messages";

import type { TrackingDeps } from "@/lib/tracking/commands/run";

/**
 * Deletes the caller's own account through `delete_own_account()` (spec 0033,
 * child 0036; AC-12), shared by the web's `deleteAccountAction` and
 * `POST /api/v1/me/account/delete`, so both apps run the same step (child
 * 0035, Mapping to actions).
 *
 * The function takes no argument: whose account goes is `auth.uid()` from the
 * JWT on `deps`' client, never a value from the request, and the project
 * still never uses the service role key (AGENTS.md section 5). It takes the
 * same `{ userId, getClient }` as the username commands, and `userId` goes
 * unread on purpose: the function needs none.
 *
 * It neither throws nor logs. A refusal returns its outcome class, the
 * function's `42501` (no `auth.uid()`) as an ended session and anything else
 * as unexpected, which the caller logs under its own event before showing the
 * failure, so a refused delete never reads as a success (AGENTS.md section 11).
 */
export async function deleteOwnAccountCommand(
  deps: TrackingDeps,
): Promise<{ ok: true } | { ok: false; error: AuthOutcome }> {
  try {
    const supabase = await deps.getClient();
    const { error } = await supabase.rpc("delete_own_account");
    if (!error) return { ok: true };
    return {
      ok: false,
      error:
        error.code === "42501"
          ? AUTH_OUTCOME.sessionExpired
          : AUTH_OUTCOME.unexpected,
    };
  } catch {
    return { ok: false, error: AUTH_OUTCOME.unexpected };
  }
}
