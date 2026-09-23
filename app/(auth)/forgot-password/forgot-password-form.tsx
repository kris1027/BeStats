"use client";

import { useActionState } from "react";
import {
  AuthFeedback,
  AuthSubmitButton,
} from "@/components/auth/auth-feedback";
import { AuthField } from "@/components/auth/auth-field";
import { type AuthActionState, IDLE_STATE } from "@/lib/auth/action-state";
import { requestPasswordResetAction } from "../actions";

/**
 * The password reset request form (spec 0005, AC-7).
 *
 * Shows the same confirmation whether or not the address has an account, which
 * is the only way the form is not an address lookup tool. The field is left
 * filled after submitting so a typo is visible and correctable: the action
 * hands the email back, because React 19 resets the input once it returns.
 */
function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    requestPasswordResetAction,
    IDLE_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
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

      <AuthSubmitButton pendingLabel="Sending…">
        Send the reset link
      </AuthSubmitButton>
    </form>
  );
}

export { ForgotPasswordForm };
