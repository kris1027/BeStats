import "server-only";

import type { V1ErrorCode } from "@bestats/core/api/v1/errors";

import type { BearerUser } from "@/lib/supabase/bearer";
import type { TrackingDeps } from "@/lib/tracking/commands/run";

import { type V1Outcome, v1Fail, v1Ok } from "./with-v1";

/**
 * The command deps for a bearer request: the verified token's user and its
 * RLS bound client, never anything from the request body (AGENTS.md
 * section 5). The v1 twin of the Server Actions' `withCookieSession`.
 */
export function bearerDeps(user: BearerUser): TrackingDeps {
  return { userId: user.userId, getClient: async () => user.client };
}

/**
 * Answers a command's result the one way every v1 write does (spec 0035,
 * Errors): the action's own result as JSON on success, so the app gets the
 * exact union the web gets (spec 0033, AC-5); on a refusal, the v1 code from
 * the resource's core table, the action's error word as `reason` and its
 * English copy as the message.
 */
export function trackingAnswer<E extends string>(
  result: { ok: true } | { ok: false; error: E },
  codes: Record<E, V1ErrorCode>,
  messages: Record<E, string>,
): V1Outcome {
  if (result.ok) return v1Ok(result);
  return v1Fail(codes[result.error], {
    reason: result.error,
    message: messages[result.error],
  });
}
