import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SIGNED_IN_PATH, isSafeNextPath } from "./next-path";

/**
 * The single place a private surface learns who is asking (spec 0005, AC-12).
 *
 * The proxy redirect is a convenience, not the boundary: it can be bypassed by
 * anything that does not go through the matcher, and a matcher is one regex
 * edit away from silently excluding a private route. So every private Server
 * Component and every Server Action resolves the user through here instead,
 * which verifies the session itself. `AGENTS.md` section 11 requires exactly
 * this second, independent layer, with Row Level Security as the third.
 *
 * `getClaims()` is used rather than `getUser()` because with an asymmetric JWT
 * signing key it verifies the token locally through Web Crypto against a cached
 * JWKS, with no network call per render. It is still a real verification, not
 * the unverified cookie read `getSession()` performs. On a project still using
 * the legacy shared secret it falls back to asking the Auth server, which is
 * slower but no less safe.
 */
export type SessionUser = {
  id: string;
  email: string;
};

/**
 * Resolves the signed in user, or null.
 *
 * Use this where signed out is a normal, renderable state: the navbar account
 * slot is the only such place today.
 *
 * Memoized per request with React `cache()`, because the navbar renders two
 * account slots and each private page calls `requireUser` too; without it
 * every call builds its own client and verifies the claims again. `cache()`
 * is scoped to one server render, so one user's session is never shared with
 * another request, and outside a render (a Server Action) it simply calls
 * through.
 *
 * @returns The verified user, or null when there is no valid session.
 */
export const getOptionalUser = cache(readOptionalUser);

async function readOptionalUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) return null;

  const { sub, email } = data.claims;
  // A claims payload with no subject is not a session we can attribute a write
  // to, so it is treated as no session rather than as a partial one.
  if (typeof sub !== "string" || sub.length === 0) return null;

  return { id: sub, email: typeof email === "string" ? email : "" };
}

/**
 * Resolves the signed in user, or redirects to sign in.
 *
 * The redirect carries the path the person was trying to reach, so signing in
 * lands them back there rather than on the catalog (AC-10).
 *
 * `headers()` is read rather than a parameter, so no caller can forget to pass
 * the path and silently send everyone to `/shows`. It also makes this function
 * request scoped, which is what keeps a private page out of the static shell.
 *
 * @returns The verified user. Never returns when there is no session.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (user) return user;

  redirect(`/sign-in?next=${encodeURIComponent(await currentPath())}`);
}

/**
 * The path of the request being rendered, for the `next` parameter.
 *
 * Next.js sets `x-invoke-path` on some runtimes and not others, so this reads
 * the header the proxy sets explicitly and falls back to the catalog. It is run
 * through the same safety check as any other `next` value, because a header is
 * no more trustworthy than a query string.
 */
async function currentPath(): Promise<string> {
  const headerList = await headers();
  const path = headerList.get("x-pathname");
  return isSafeNextPath(path) ? path : DEFAULT_SIGNED_IN_PATH;
}
