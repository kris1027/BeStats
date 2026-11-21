import { z } from "zod";

import { DELETE_ACCOUNT_CONFIRM_WORD } from "../../auth/messages";

/**
 * `POST /api/v1/me/account/delete` body (spec 0035, API surface; child 0036).
 * The confirm word is the one both apps make you type, checked again on the
 * server so a request without it deletes nothing. The body carries no user
 * ID: whose account goes is `auth.uid()` inside `delete_own_account()`
 * (AGENTS.md section 11, validate input; the user comes from the session).
 */
export const v1AccountDeleteBodySchema = z.object({
  confirm: z.literal(DELETE_ACCOUNT_CONFIRM_WORD),
});

export type V1AccountDeleteBody = z.infer<typeof v1AccountDeleteBodySchema>;
