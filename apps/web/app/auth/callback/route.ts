import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { AUTH_EVENT, logAuthEvent } from "@/lib/auth/log";
import { AUTH_OUTCOME, type AuthOutcome } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";
import { classifyAuthError } from "@/lib/auth/supabase-error";
import { createClient } from "@/lib/supabase/server";

/**
 * Turns the token in a confirmation or recovery email into a session
 * (spec 0005, AC-3, AC-7).
 *
 * The one place in the whole feature that is a Route Handler rather than a
 * Server Action, because an email link is a GET the browser navigates to; there
 * is no form to post.
 *
 * Two link shapes arrive here, and both are handled, because which one Supabase
 * sends is a property of the email template, not of our code:
 *
 * - **`code`**, the PKCE shape, which is what the stock templates produce. The
 *   link in the message points at Supabase's own `/auth/v1/verify`, which
 *   consumes the token and then redirects here with an authorization code. The
 *   code verifier is in a cookie this server set when it called `signUp` or
 *   `resetPasswordForEmail`, so the exchange can only succeed in the browser
 *   that made the request.
 * - **`token_hash` plus `type`**, which a template customised to use
 *   `{{ .TokenHash }}` produces, pointing straight here. Spec 0005's API
 *   surface names this shape; the stock template does not use it, so both are
 *   accepted rather than betting on one.
 *
 * With a `code` there is no `type` in the link, so the journey is carried in
 * our own `type` parameter, which is baked into the `redirect_to` when the
 * recovery email is requested. That is what keeps a recovery link landing on
 * the password form and nowhere else.
 *
 * `email_change` is refused in both shapes: nothing in this feature changes an
 * address, and quietly accepting a token type no code path issues is how an
 * unintended flow gets in.
 */
const CONFIRM_TYPES = new Set<string>(["signup", "email"]);
const RECOVERY_TYPE = "recovery";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const isRecovery = type === RECOVERY_TYPE;

  // A type we did not issue is refused before any token is spent.
  if (type && !isRecovery && !CONFIRM_TYPES.has(type)) {
    return refuse(origin, AUTH_OUTCOME.invalidLink);
  }

  const supabase = await createClient();

  let error: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>["error"] =
    null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    }));
  } else {
    return refuse(origin, AUTH_OUTCOME.invalidLink);
  }

  if (error) {
    return refuse(origin, classifyAuthError(error));
  }

  // A recovery session may only set a password, so it never honours `next`:
  // following a reset link must land on the form that uses it, and nowhere
  // else (AC-7). A confirmation carries the person on to wherever they were
  // heading before they had to stop and sign up.
  const destination = isRecovery
    ? "/reset-password"
    : safeNextPath(searchParams.get("next"));

  // 303 rather than 307: the browser must not repeat anything against the new
  // URL, and the token in the current URL is single use.
  return NextResponse.redirect(new URL(destination, origin), 303);
}

/**
 * Sends a failed link back to sign in with a plain, classified message.
 *
 * No session is created, and the token is never echoed back into the redirect,
 * which would put it in a browser history and a referrer header (AC-19).
 */
function refuse(origin: string, outcome: AuthOutcome): NextResponse {
  logAuthEvent(AUTH_EVENT.callback, "refused", outcome);

  const signIn = new URL("/sign-in", origin);
  signIn.searchParams.set("error", outcome);
  return NextResponse.redirect(signIn, 303);
}
