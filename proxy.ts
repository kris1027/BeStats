import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { isPrivatePath } from "@/lib/auth/private-paths";
import { parseMovieId } from "@/lib/catalog/ids";
import { getPublicEnv, publicEnvProblems } from "@/lib/env";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

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
  // A malformed movie id is a real 404, decided here because the movie page
  // streams its shell first and by then the status is already 200 (spec 0006,
  // AC-8). First, so it needs no auth configuration and makes no Supabase or
  // TMDB call.
  const malformedMovie = malformedMovieResponse(request);
  if (malformedMovie) return malformedMovie;

  // The catalog is public, so an install whose auth configuration is missing
  // or incomplete should still serve pages. Warn once instead of failing every
  // request. Any actual auth call still throws loudly from `getPublicEnv`.
  //
  // This asks the same schema `getPublicEnv` validates, not a hand picked list
  // of variables. A narrower check here let an environment with the Supabase
  // keys but no `NEXT_PUBLIC_SITE_URL` through, and `getPublicEnv` below then
  // failed every request, public ones included.
  const envProblems = publicEnvProblems();
  if (envProblems) {
    if (!warnedAboutMissingConfig) {
      warnedAboutMissingConfig = true;
      console.warn(
        `[proxy] Authentication is not configured, so sessions are not being refreshed. ${envProblems}. Copy .env.example to .env.local to enable it.`,
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
      // The same flags the server client writes, so a refresh here never
      // rewrites the session cookie without `HttpOnly` (spec 0005, AC-25).
      cookieOptions: sessionCookieOptions(),
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

/** One segment under `/movies`; deeper paths already match no route. */
const MOVIE_PATH = /^\/movies\/([^/]+)$/;

/**
 * A path that matches no route, so rendering it renders `app/not-found.tsx`.
 * Rewritten to rather than redirected to, so the address bar keeps the URL
 * the visitor asked for.
 */
const NOT_FOUND_PATH = "/_movie-not-found";

/**
 * The 404 for `/movies/{segment}` when the segment is not a canonical movie
 * id, or null for every other request. Shares `parseMovieId` with the page, so
 * the proxy and the route cannot disagree about what a movie URL looks like.
 *
 * The status is set explicitly rather than left to the rewrite, so the answer
 * is a 404 even if the rendered page would otherwise report 200.
 */
function malformedMovieResponse(request: NextRequest): NextResponse | null {
  const match = MOVIE_PATH.exec(request.nextUrl.pathname);
  if (!match) return null;

  let segment: string;
  try {
    segment = decodeURIComponent(match[1]);
  } catch {
    segment = match[1];
  }
  if (parseMovieId(segment) !== null) return null;

  return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
    status: 404,
  });
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
     * request too. `/movies/` is never an image, so `/movies/550.jpg` still
     * reaches the malformed id rule and gets its 404 (spec 0006, AC-8).
     */
    "/((?!_next/static|_next/image|favicon.ico|(?!movies/).*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
