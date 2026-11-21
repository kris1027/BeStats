import "server-only";

import type { TrackingDeps } from "@/lib/tracking/commands/run";

/**
 * Deletes the caller's own account through `delete_own_account()` (spec 0033,
 * child 0036; AC-12), shared by the web's `deleteAccountAction` and
 * `POST /api/v1/me/account/delete`, so both apps run the same step (child
 * 0035, Mapping to actions).
 *
 * The function takes no argument: whose account goes is `auth.uid()` from the
 * JWT on `deps`' client, never a value from the request, and the project
 * still never uses the service role key (AGENTS.md section 5). It neither
 * throws nor logs; the caller logs under its own event and shows the failure,
 * so a refused delete never reads as a success (AGENTS.md section 11).
 */
export async function deleteOwnAccountCommand(
  deps: TrackingDeps,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const supabase = await deps.getClient();
    const { error } = await supabase.rpc("delete_own_account");
    return error ? { ok: false } : { ok: true };
  } catch {
    return { ok: false };
  }
}
