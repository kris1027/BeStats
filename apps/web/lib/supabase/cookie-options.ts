import { getPublicEnv } from "@/lib/env";

/**
 * The flags every Supabase session cookie carries, shared by the server client
 * and the proxy so the proxy's refresh can never quietly write the cookie back
 * without them (spec 0005, AC-25).
 *
 * `httpOnly` because nothing in this app reads the session from script: every
 * auth call goes through a Server Action, and the `@supabase/ssr` default of
 * `false` would leave the token readable by any cross site scripting bug.
 *
 * `secure` follows `NEXT_PUBLIC_SITE_URL`, not `NODE_ENV`, so `pnpm start` on
 * `http://localhost` still gets a cookie in every browser and the deployed
 * `https` origin always gets `Secure`. The site URL is inlined at build time,
 * so this follows the URL the build was made with.
 *
 * A function rather than a constant, because a constant would call
 * `getPublicEnv()` at import time and break a build with no environment
 * configured. It returns these two keys only: the library turns `name` into the
 * storage key, always overrides `maxAge`, and treats `domain` as a reason for
 * extra host only clears. `sameSite` and `path` stay at its `lax` and `/`.
 */
export function sessionCookieOptions(): { httpOnly: true; secure: boolean } {
  const { NEXT_PUBLIC_SITE_URL } = getPublicEnv();

  return {
    httpOnly: true,
    secure: new URL(NEXT_PUBLIC_SITE_URL).protocol === "https:",
  };
}
