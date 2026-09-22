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
import { changePasswordAction } from "./actions";

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
    <form action={formAction} className="flex flex-col gap-5">
      <AuthFeedback state={state} />

      {/*
       * AC-17: a write that did not happen must never look like one that did,
       * and the message must come with a way forward. `next` carries this page,
       * so signing in again lands back here rather than on the catalog.
       */}
      {state.outcome === AUTH_OUTCOME.sessionExpired ? (
        <Link
          href="/sign-in?next=%2Faccount"
          className="rounded-sm text-sm text-text-link hover:text-foreground hover:underline"
        >
          Sign in again
        </Link>
      ) : null}

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

      <AuthSubmitButton pendingLabel="Saving…">
        Change password
      </AuthSubmitButton>
    </form>
  );
}

export { ChangePasswordForm };
