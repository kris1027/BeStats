import "server-only";

import type { V1ErrorCode } from "@bestats/core/api/v1/errors";

/**
 * Records one refused or failed `/api/v1` answer (spec 0033, child 0035).
 *
 * It follows the structural rule of `lib/auth/log.ts` and
 * `lib/tracking/log.ts`: a route name and a closed error code, and no
 * parameter a header, token, id or body could travel through, so a log line
 * can never carry a secret or someone's viewing history (AGENTS.md
 * section 11). Successes are not logged.
 *
 * @param name The route name `withV1` was given, such as `movies.get`.
 * @param code The v1 error code the route answered with.
 */
export function logV1Failure(name: string, code: V1ErrorCode): void {
  console.warn(JSON.stringify({ event: `api_v1.${name}`, outcome: code }));
}
