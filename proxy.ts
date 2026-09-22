import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { isPrivatePath } from "@/lib/auth/private-paths";
import { getPublicEnv } from "@/lib/env";

let warnedAboutMissingConfig = false;

/**
 * The request pathname, passed on so `requireUser()` can build the `next`
 * parameter without every private page having to hand it its own path
 * (spec 0005, AC-10).
 */
const PATHNAME_HEADER = "x-pathname";

/**
 * Refreshes the Supabase session on every matched request, and redirects a
 * signed out visitor away from a private path (spec 0005, AC-10).
 *
 * Server Components cannot write cookies, so without the refresh the access
 * token would expire and never be renewed, which shows up as random sign outs.
 *
 * The redirect here is a convenience, not the security boundary. It exists so a
 * signed out visitor sees the sign in page instead of an error, and it can be
 * bypassed by anything the matcher below does not cover. The real boundary is
 * `requireUser()` in every private Server Component and Server Action, and Row
 * Level Security underneath both (`AGENTS.md` section 11). Nothing private may
 * ever rely on this function having run.
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
    return NextResponse.next({ request: withPathname(request) });
  }

  const env = getPublicEnv();
  let response = NextResponse.next({ request: withPathname(request) });

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

          response = NextResponse.next({ request: withPathname(request) });

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
  // returned, otherwise a renewed token cannot be written back. Its result is
  // also what the guard below reads, so the session is verified once per
  // request rather than twice.
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = !error && typeof data?.claims?.sub === "string";

  const { pathname, search } = request.nextUrl;

  // Only a navigation is redirected, never a Server Action.
  //
  // A Server Action is a POST to the page's own URL, and answering one with a
  // redirect breaks the action protocol: the client is expecting an action
  // result and gets a document instead, so the page is replaced with a raw
  // payload and the person sees a blank screen with no message. That is exactly
  // what AC-17 rules out, and it was reproduced in a browser by expiring the
  // session between rendering the change password form and submitting it.
  //
  // An unauthenticated action is not left unguarded by this: it is refused by
  // `requireUser()` or `getOptionalUser()` inside the action itself, which is
  // the real boundary anyway (AC-12).
  const isNavigation = request.method === "GET";

  if (isNavigation && !signedIn && isPrivatePath(pathname)) {
    const signIn = new URL("/sign-in", request.url);
    // The query string travels too, so a link into a filtered private list
    // survives the detour through sign in.
    signIn.searchParams.set("next", `${pathname}${search}`);

    // Built from `response` rather than a fresh redirect, so any refreshed
    // cookie set above is still written. Dropping it here would sign out a
    // visitor whose token had just been renewed.
    const redirect = NextResponse.redirect(signIn);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}

/**
 * Copies the request with its pathname attached as a header.
 *
 * A Server Component cannot read the URL it is rendering, and `requireUser()`
 * needs it to build `?next=`. Passing it as a header is the supported way to
 * get it there. It is set on the request, never the response, so it is never
 * visible to the browser.
 */
function withPathname(request: NextRequest): NextRequest {
  request.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return request;
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
