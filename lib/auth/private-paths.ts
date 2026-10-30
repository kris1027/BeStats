import { LIBRARY_PATHS } from "@/lib/catalog/library-list";

/**
 * Every path prefix that requires a session (spec 0005, value sourcing table).
 *
 * One exported constant rather than a check written into the proxy, so the
 * routes features 9, 14 and 15 will add are guarded the day they exist instead
 * of each remembering to register itself. The library routes come straight from
 * `LIBRARY_PATHS` for exactly that reason: a route added to the table is
 * guarded the day it exists (prompts/library-page-urls.md). A path that 404s
 * while guarded is harmless, a path that ships unguarded is a leak.
 *
 * This is the convenience layer only. `AGENTS.md` section 11 requires the real
 * boundary to be the server side recheck in `requireUser()` plus Row Level
 * Security, so nothing here is load bearing on its own.
 */
export const PRIVATE_PATH_PREFIXES = ["/account", ...LIBRARY_PATHS] as const;

/**
 * Whether a pathname falls under a private prefix.
 *
 * Matches the prefix itself and anything nested beneath it, but not a path that
 * merely starts with the same characters: `/watchlists-public` is not private
 * just because `/watchlist` is.
 *
 * @param pathname The request pathname, with no query string.
 * @returns Whether a session is required to see it.
 */
export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
