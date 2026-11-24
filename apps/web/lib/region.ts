import "server-only";

import { parseRegion, type Region } from "@bestats/core/catalog/region";
import { headers } from "next/headers";
import { cache } from "react";

/**
 * The visitor's country for Where to watch and the age rating (spec 0022,
 * AC-9), from the approximate country Vercel derives from the connection.
 *
 * Read once per request (React `cache()`), always outside a `use cache`
 * scope and inside the Suspense boundary of the section that needs it, so
 * the title pages keep their prerendered shells (AC-10). It lives outside
 * `lib/tmdb`, which may not read request state, and the value is never
 * stored, logged or sent to TMDB: the cached extras hold every country and
 * the page picks this one after they return.
 */
export const getVisitorRegion = cache(async (): Promise<Region> => {
  return regionFromHeaders(await headers());
});

/**
 * The one region rule both apps follow (spec 0022, AC-9; prompts/
 * mobile-look-title-extras.md, decision 1): Vercel's approximate country of
 * the connection, read through core's `parseRegion`. A route handler, which
 * has its request's headers in hand, calls this directly; pages go through
 * `getVisitorRegion`. Never stored, logged or sent to TMDB.
 */
export function regionFromHeaders(requestHeaders: Headers): Region {
  return parseRegion(requestHeaders.get("x-vercel-ip-country"));
}
