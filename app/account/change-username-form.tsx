"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  AuthFeedback,
  AuthSubmitButton,
} from "@/components/auth/auth-feedback";
import { AuthField } from "@/components/auth/auth-field";
import { LocalDateTime } from "@/components/local-date-time";
import { type AuthActionState, IDLE_STATE } from "@/lib/auth/action-state";
import { AUTH_OUTCOME } from "@/lib/auth/messages";
import { USERNAME_HINT, USERNAME_MAX_LENGTH } from "@/lib/auth/username";
import { changeUsernameAction } from "./actions";

/**
 * The username form on `/account` (prompts/account-username.md, Q13).
 *
 * Three states, all decided by the page from the stored profile: no username
 * yet (an empty field), unlocked (the current name, editable), and locked (the
 * current name, disabled, with when it unlocks). The lock shown here is only a
 * courtesy; the trigger on `profiles` is what refuses an early change, and its
 * refusal still reaches this form if the two ever disagree.
 *
 * @param username The current username, or null when none is set.
 * @param unlocksAt When the weekly lock ends, as an ISO string, or null when
 * it does not hold now.
 */
function ChangeUsernameForm({
  username,
  unlocksAt,
}: {
  username: string | null;
  unlocksAt: string | null;
}) {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    changeUsernameAction,
    IDLE_STATE,
  );

  const locked = unlocksAt !== null;

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      <AuthFeedback state={state} />

      {state.outcome === AUTH_OUTCOME.sessionExpired ? (
        <Link
          href="/sign-in?next=%2Faccount"
          className="rounded-sm text-sm text-text-link hover:text-foreground hover:underline"
        >
          Sign in again
        </Link>
      ) : null}

      <AuthField
        label="Username"
        name="username"
        autoComplete="nickname"
        maxLength={USERNAME_MAX_LENGTH}
        disabled={locked}
        hint={locked ? undefined : USERNAME_HINT}
        defaultValue={state.values?.username ?? username ?? undefined}
        error={state.fieldErrors?.username}
      />

      {locked ? (
        <p className="text-sm text-muted-foreground">
          You can change it again on <LocalDateTime iso={unlocksAt} />.
        </p>
      ) : null}

      {/* Bottom of the card, level with Change password beside it. */}
      <div className="mt-auto">
        <AuthSubmitButton pendingLabel="Saving…" disabled={locked}>
          Save username
        </AuthSubmitButton>
      </div>
    </form>
  );
}

export { ChangeUsernameForm };
