import { API_VERSION, MIN_APP_VERSION } from "@bestats/core/api/v1/version";

import { v1Ok, withV1 } from "@/lib/api/v1/with-v1";

/**
 * `GET /api/v1/config` (spec 0033, child 0035): the minimum app version, read
 * before anything else. It is the one route without the version check, so an
 * app too old for every other route can still learn that it must update.
 * The app reaches the web only through `/api/v1` (AGENTS.md section 5).
 */
export const GET = withV1({
  name: "config",
  auth: "public",
  cache: "public, s-maxage=60",
  skipVersionCheck: true,
  handler: async () =>
    v1Ok({ minAppVersion: MIN_APP_VERSION, apiVersion: API_VERSION }),
});
