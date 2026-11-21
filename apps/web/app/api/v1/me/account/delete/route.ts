import { v1AccountDeleteBodySchema } from "@bestats/core/api/v1/account";
import { DELETE_ACCOUNT_COPY } from "@bestats/core/auth/messages";

import { bearerDeps } from "@/lib/api/v1/tracking";
import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { deleteOwnAccountCommand } from "@/lib/auth/commands/account";
import { AUTH_EVENT, logAuthEvent } from "@/lib/auth/log";

/**
 * `POST /api/v1/me/account/delete` (spec 0035, API surface; child 0036): the
 * app's Delete account screen. The body must be `{ confirm: "DELETE" }`, or
 * the route answers 400 and deletes nothing. It runs the same command as the
 * web action, bound to the verified token's user, and answers 204 only after
 * Postgres confirms; any failure is a 500 with the "still here" copy, so the
 * app never signs out on a delete that did not happen (AGENTS.md section 11).
 */
export const POST = withV1({
  name: "me.account.delete",
  auth: "bearer",
  input: { body: v1AccountDeleteBodySchema },
  handler: async ({ user }) => {
    const result = await deleteOwnAccountCommand(bearerDeps(user));
    if (result.ok) return v1Ok(null, 204);
    logAuthEvent(AUTH_EVENT.deleteAccount, "error", result.error);
    return v1Fail("internal", { message: DELETE_ACCOUNT_COPY.failed });
  },
});
