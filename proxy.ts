import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";

let warnedAboutMissingConfig = false;

/**
 * Refreshes the Supabase session on every matched request.
 *
 * Server Components cannot write cookies, so without this the access token
 * would expire and never be renewed, which shows up as random sign outs. This
 * file only keeps the session fresh. Route protection belongs to the
 * authentication feature, so there are no redirects here.
 *
 * In Next.js 16 this file is `proxy.ts` and the export is `proxy`;
 * `middleware.ts` is deprecated.
 */
export async function proxy(request: NextRequest) {
  // The catalog is public, so an install with no Supabase project configured
  // should still serve pages. Warn once instead of failing every request. Any
  // actual auth call still throws loudly from `getPublicEnv`.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    if (!warnedAboutMissingConfig) {
      warnedAboutMissingConfig = true;
      console.warn(
        "[proxy] Supabase is not configured, so sessions are not being refreshed. Copy .env.example to .env.local to enable authentication.",
      );
    }
    return NextResponse.next({ request });
  }

  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Update the request so anything rendering later in this same pass
          // reads the refreshed session rather than the expired one.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          // `@supabase/ssr` hands back the no-store cache headers that must
          // accompany a `Set-Cookie` for auth, so a CDN or proxy never serves
          // one user's session token to somebody else (AGENTS.md section 11).
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // This is what triggers the refresh. It must run before the response is
  // returned, otherwise a renewed token cannot be written back.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except the ones Next.js serves as static assets, plus common
     * image files. Without this the proxy would run for every CSS, JS and image
     * request too.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
