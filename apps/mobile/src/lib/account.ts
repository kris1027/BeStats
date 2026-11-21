import type { V1AccountDeleteBody } from "@bestats/core/api/v1/account";
import {
  v1ProfileSchema,
  v1ProfileWriteOkSchema,
} from "@bestats/core/api/v1/profile";
import { DELETE_ACCOUNT_CONFIRM_WORD } from "@bestats/core/auth/messages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { apiRequest } from "./api";
import { PRIVATE_QUERY_ROOT } from "./query-client";

/**
 * The caller's profile key. It sits under the private root, so sign out, an
 * expired session and account deletion wipe it with every other `me` query
 * (spec 0033, AC-13), and private state never outlives its session (AGENTS.md
 * section 11).
 */
export const profileKey = [PRIVATE_QUERY_ROOT, "profile"] as const;

/**
 * `GET /api/v1/me/profile`: the username (null while unclaimed) and when it
 * may change again. Only asked while signed in; a failed read is an error the
 * screen shows with Retry, never an unclaimed name (AGENTS.md section 11).
 */
export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: profileKey,
    queryFn: () =>
      apiRequest("/api/v1/me/profile", v1ProfileSchema, { auth: true }),
    enabled,
  });
}

/**
 * `PUT /api/v1/me/profile` with a username, the one route that claims or
 * changes it, the same command as the web (spec 0035, Mapping to actions).
 * The profile reloads after a confirmed write, so the lock line comes from the
 * server, never from a guess here (AGENTS.md section 11, no false success).
 */
export function useSaveUsername() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => putUsername(username),
    onSuccess: () => client.invalidateQueries({ queryKey: profileKey }),
  });
}

/**
 * Claims or changes the username through `/api/v1`, the only way the app
 * reaches user state (AGENTS.md section 5); shared by sign up, which has no
 * mutation hook to hang it on, and `useSaveUsername`.
 */
export function putUsername(username: string) {
  return apiRequest("/api/v1/me/profile", v1ProfileWriteOkSchema, {
    method: "PUT",
    body: { username },
    auth: true,
  });
}

/**
 * `POST /api/v1/me/account/delete` (spec 0033, child 0036; AC-12). Resolves
 * only on the server's 204, whose empty body reads as null; any refusal
 * throws `ApiError`, so the screen never signs out on a delete that did not
 * happen (AGENTS.md section 11).
 */
export async function deleteOwnAccount(): Promise<void> {
  const body: V1AccountDeleteBody = { confirm: DELETE_ACCOUNT_CONFIRM_WORD };
  await apiRequest("/api/v1/me/account/delete", z.null(), {
    method: "POST",
    body,
    auth: true,
  });
}
