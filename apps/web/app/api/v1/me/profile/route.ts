import {
  PROFILE_ERROR_TO_V1,
  type V1Profile,
  v1ProfileBodySchema,
} from "@bestats/core/api/v1/profile";
import { AUTH_MESSAGES } from "@bestats/core/auth/messages";
import {
  isUsernameLocked,
  usernameUnlocksAt,
} from "@bestats/core/auth/username";

import { bearerDeps } from "@/lib/api/v1/tracking";
import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import {
  changeUsernameCommand,
  claimUsernameCommand,
  readProfileRow,
} from "@/lib/auth/commands/username";

/**
 * `GET /api/v1/me/profile` (spec 0035): the caller's username, null while
 * unclaimed, and when the weekly lock lifts, null when there is none to wait
 * for, the same rule `/account` shows (prompts/account-username.md). A failed
 * read answers 500 rather than a null username, so the app never mistakes an
 * outage for an unclaimed name (AGENTS.md section 11).
 */
export const GET = withV1({
  name: "me.profile.get",
  auth: "bearer",
  handler: async ({ user }) => {
    const read = await readProfileRow(bearerDeps(user));
    if (!read.ok) return v1Fail("internal");

    const row = read.row;
    const body: V1Profile = {
      username: row?.username ?? null,
      usernameChangeableAt:
        row && isUsernameLocked(row.usernameChangedAt, new Date())
          ? usernameUnlocksAt(row.usernameChangedAt).toISOString()
          : null,
    };
    return v1Ok(body);
  },
});

/**
 * `PUT /api/v1/me/profile` (spec 0035, Mapping to actions): the one route
 * that owns every username write. With no `profiles` row yet it claims the
 * name through the command behind sign up; with one it changes it through the
 * command behind `changeUsernameAction`, so a phone passes the same steps as
 * the web (spec 0033, AC-5). A taken or reserved name, or the weekly limit
 * (`BS002`), is 409 `conflict` with the action's word as `reason`; the user id
 * is the verified token's (AGENTS.md section 5).
 */
export const PUT = withV1({
  name: "me.profile.put",
  auth: "bearer",
  input: { body: v1ProfileBodySchema },
  handler: async ({ input, user }) => {
    const deps = bearerDeps(user);
    const read = await readProfileRow(deps);
    if (!read.ok) return v1Fail("internal");

    const { username } = input.body;
    const result = read.row
      ? await changeUsernameCommand(deps, {
          username,
          current: read.row.username,
        })
      : await claimUsernameCommand(deps, { username });

    if (result.ok) return v1Ok(result);
    return v1Fail(PROFILE_ERROR_TO_V1[result.error], {
      reason: result.error,
      message: AUTH_MESSAGES[result.error],
    });
  },
});
