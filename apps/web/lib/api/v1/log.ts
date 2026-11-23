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

/**
 * Records a part of a v1 answer that failed while the answer itself was
 * served, such as a show's cast (feature 29, slice 2): otherwise that
 * failure leaves no trace once its cached result is reused. Same rule as
 * `logV1Failure`: a route name, the part and a closed error kind, never an
 * id or anything a person sent (AGENTS.md section 11).
 *
 * @param name The route name `withV1` was given, such as `shows.get`.
 * @param part The part left out of the answer, such as `cast`.
 * @param kind The catalog error's closed kind, such as `timeout`.
 */
export function logV1PartFailure(
  name: string,
  part: string,
  kind: string,
): void {
  console.warn(
    JSON.stringify({ event: `api_v1.${name}.${part}`, outcome: kind }),
  );
}
