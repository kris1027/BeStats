"use client";

import { useActionState } from "react";
import {
  AuthFeedback,
  AuthSubmitButton,
} from "@/components/auth/auth-feedback";
import { AuthField } from "@/components/auth/auth-field";
import { type AuthActionState, IDLE_STATE } from "@/lib/auth/action-state";
import { changePasswordAction } from "./actions";
import { SignInAgainLink } from "./sign-in-again-link";

/**
 * The change password form on `/account` (spec 0005, AC-16, AC-17).
 *
 * The current password is asked for because `updateUser` alone does not verify
 * it, so without it an unlocked browser is an account takeover.
 *
 * When the action reports an expired session it says so and offers a sign in
 * link carrying this path, so the person lands back here. AC-17 requires that a
 * write which did not happen never looks like one that did, and a dead end
 * message with no way forward is the failure `StatePanel` already refuses.
 */
function ChangePasswordForm() {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    changePasswordAction,
    IDLE_STATE,
  );

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      <AuthFeedback state={state} />

      <SignInAgainLink state={state} />

      <AuthField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        placeholder="Enter your current password"
        error={state.fieldErrors?.currentPassword}
      />

      <AuthField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        error={state.fieldErrors?.password}
      />

      <AuthField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        placeholder="Type it again"
        error={state.fieldErrors?.confirmPassword}
      />

      {/*
       * Pinned to the bottom, so in the two column layout it lines up with
       * Save username; with no spare height `mt-auto` is zero.
       */}
      <div className="mt-auto">
        <AuthSubmitButton pendingLabel="Saving…">
          Change password
        </AuthSubmitButton>
      </div>
    </form>
  );
}

export { ChangePasswordForm };
