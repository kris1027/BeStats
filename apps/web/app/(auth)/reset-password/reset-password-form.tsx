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
import { resetPasswordAction } from "../actions";

/**
 * The form that sets a new password from a recovery session (spec 0005, AC-8,
 * AC-24).
 *
 * The action refuses anything but a recovery session rather than appearing to
 * succeed, and offers the way back to request a fresh link. A recovery link is
 * single use, expires, and is spent by a successful reset, so landing here
 * without a live one is the common case, not the rare one.
 */
function ResetPasswordForm() {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    resetPasswordAction,
    IDLE_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <AuthFeedback state={state} />

      {state.outcome === AUTH_OUTCOME.sessionExpired ? (
        <Link
          href="/forgot-password"
          className="rounded-sm text-sm text-text-link hover:text-foreground hover:underline"
        >
          Request a new reset link
        </Link>
      ) : null}

      <AuthField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        error={state.fieldErrors?.password}
      />

      <AuthSubmitButton pendingLabel="Saving…">
        Set new password
      </AuthSubmitButton>
    </form>
  );
}

export { ResetPasswordForm };
