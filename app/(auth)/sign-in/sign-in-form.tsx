"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  AuthFeedback,
  AuthSubmitButton,
} from "@/components/auth/auth-feedback";
import { AuthField } from "@/components/auth/auth-field";
import { type AuthActionState, IDLE_STATE } from "@/lib/auth/action-state";
import { AUTH_OUTCOME } from "@/lib/auth/messages";
import { signInAction } from "../actions";

/**
 * The sign in form from `design/desktop-sign-in-page.svg` (spec 0005, AC-4,
 * AC-5, AC-6).
 *
 * A client component because `useActionState` is what renders the message the
 * action returned. The action itself still runs on the server, so no credential
 * and no token is ever handled here.
 *
 * `next` travels as a hidden field rather than staying in the URL, because the
 * action posts to itself and would otherwise lose it. It is validated again
 * server side; a hidden field is no more trustworthy than a query string.
 *
 * The Google button and its divider the artboard draws are deliberately absent.
 * Feature 20 creates the OAuth client and restores them to the slot above the
 * fields; a button that cannot sign anyone in is a false affordance, so it is
 * omitted rather than faked (spec 0005, Consequences).
 */
function SignInForm({
  next,
  initialError,
  initialNotice,
}: {
  next?: string;
  initialError?: string;
  initialNotice?: string;
}) {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    signInAction,
    initialState(initialError, initialNotice),
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <AuthFeedback state={state} />

      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={state.fieldErrors?.email}
      />

      <div className="flex flex-col gap-2">
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          error={state.fieldErrors?.password}
        />

        <Link
          href="/forgot-password"
          className="self-end rounded-sm text-sm text-text-link hover:text-foreground hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      {/*
       * The one case where the neutral rule is relaxed. Reaching it required
       * the correct password, so offering the resend path reveals nothing the
       * person asking does not already know (AC-6).
       */}
      {state.outcome === AUTH_OUTCOME.emailNotConfirmed ? (
        <Link
          href="/check-email"
          className="rounded-sm text-sm text-text-link hover:text-foreground hover:underline"
        >
          Send the confirmation link again
        </Link>
      ) : null}

      <AuthSubmitButton pendingLabel="Signing in…">Sign in</AuthSubmitButton>
    </form>
  );
}

/**
 * What the form shows before anything is submitted.
 *
 * An error from the callback wins over a notice, because if both somehow
 * arrive the one asking the person to act is the one they need to see.
 */
function initialState(
  initialError: string | undefined,
  initialNotice: string | undefined,
): AuthActionState {
  if (initialError) {
    return {
      status: "error",
      message: initialError,
      outcome: AUTH_OUTCOME.invalidLink,
    };
  }
  if (initialNotice) return { status: "success", message: initialNotice };
  return IDLE_STATE;
}

export { SignInForm };
