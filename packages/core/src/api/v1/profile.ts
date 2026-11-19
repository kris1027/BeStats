import { z } from "zod";

import { AUTH_OUTCOME } from "../../auth/messages";
import { usernameSchema } from "../../auth/username";
import type { V1ErrorCode } from "./errors";

/**
 * The profile contracts of `/api/v1` (spec 0035, API surface): the caller's
 * username and when it may next change, and the one route that owns every
 * username write (claim at sign up, change on the account screen). The
 * `profiles` row holds only the username (AGENTS.md section 8).
 */

/**
 * `GET /api/v1/me/profile`. `username` is null while unclaimed, which the app
 * reads as "show the username field first" (spec 0035, Sign up on mobile).
 * `usernameChangeableAt` is when the weekly lock lifts, null when there is no
 * lock to wait for, worked out by `usernameUnlocksAt` as `/account` does.
 */
export const v1ProfileSchema = z.object({
  username: z.string().nullable(),
  usernameChangeableAt: z.string().nullable(),
});

export type V1Profile = z.infer<typeof v1ProfileSchema>;

/**
 * `PUT /api/v1/me/profile` body, checked by the same username rule as both
 * web forms (trimmed, ASCII, not reserved), so a phone can store nothing the
 * web would refuse. The database checks it again (AGENTS.md section 5).
 */
export const v1ProfileBodySchema = z.object({ username: usernameSchema });

/**
 * A successful username write. `changed` is false when the name was already
 * the caller's, the case the web answers "That's already your username."
 * rather than claiming an update (AGENTS.md section 11, no false success).
 */
export const v1ProfileWriteOkSchema = z.object({
  ok: z.literal(true),
  changed: z.boolean(),
});

/** The refusals a username write can return, as the web actions name them. */
export type UsernameWriteError =
  | typeof AUTH_OUTCOME.usernameTaken
  | typeof AUTH_OUTCOME.usernameLocked
  | typeof AUTH_OUTCOME.unexpected;

/**
 * How a refused username write answers over HTTP (spec 0035, Errors): a taken
 * or reserved name and the weekly limit (`BS002`) are 409 `conflict`, told
 * apart by `reason`; anything else is 500.
 */
export const PROFILE_ERROR_TO_V1: Record<UsernameWriteError, V1ErrorCode> = {
  [AUTH_OUTCOME.usernameTaken]: "conflict",
  [AUTH_OUTCOME.usernameLocked]: "conflict",
  [AUTH_OUTCOME.unexpected]: "internal",
};
