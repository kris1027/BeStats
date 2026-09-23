"use client";

import { useActionState } from "react";
import {
  AuthFeedback,
  AuthSubmitButton,
} from "@/components/auth/auth-feedback";
import { AuthField } from "@/components/auth/auth-field";
import { type AuthActionState, IDLE_STATE } from "@/lib/auth/action-state";
import { signUpAction } from "../actions";

/**
 * The sign up form (spec 0005, AC-1, AC-2, AC-9).
 *
 * The same card, fields and spacing as sign in, because `design/` draws only
 * the sign in screen and inventing a second look for its twin would be a
 * redesign, not an adaptation (`AGENTS.md` section 3).
 *
 * The password rule is stated up front rather than only on rejection. A rule
 * you learn by failing is a rule the form kept to itself.
 *
 * There is no "already have an account?" hint on the email field and no check
 * as you type. Either would turn this form into the membership lookup AC-2
 * exists to prevent.
 */
function SignUpForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    signUpAction,
    IDLE_STATE,
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
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />

      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        error={state.fieldErrors?.password}
      />

      <AuthSubmitButton pendingLabel="Creating your account…">
        Create account
      </AuthSubmitButton>
    </form>
  );
}

export { SignUpForm };
