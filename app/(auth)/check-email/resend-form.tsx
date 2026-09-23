"use client";

import { useActionState } from "react";
import {
  AuthFeedback,
  AuthSubmitButton,
} from "@/components/auth/auth-feedback";
import { AuthField } from "@/components/auth/auth-field";
import { type AuthActionState, IDLE_STATE } from "@/lib/auth/action-state";
import { resendConfirmationAction } from "../actions";

/**
 * The resend control on `/check-email` (spec 0005, AC-1).
 *
 * The address is editable rather than fixed. Someone who mistyped it on sign up
 * has no other way forward, and the alternative, sending them back to start
 * over, loses the account they just made under the wrong address anyway.
 *
 * It answers the same way whatever address is given, so it cannot be used to
 * ask whether an address is registered here.
 */
function ResendForm({ email, next }: { email?: string; next?: string }) {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    resendConfirmationAction,
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
        defaultValue={state.values?.email ?? email}
        error={state.fieldErrors?.email}
      />

      <AuthSubmitButton pendingLabel="Sending…">
        Send the link again
      </AuthSubmitButton>
    </form>
  );
}

export { ResendForm };
