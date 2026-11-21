"use client";

import {
  type AuthActionState,
  IDLE_STATE,
} from "@bestats/core/auth/action-state";
import {
  DELETE_ACCOUNT_CONFIRM_WORD,
  DELETE_ACCOUNT_COPY,
} from "@bestats/core/auth/messages";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAccountAction } from "./actions";
import { SignInAgainLink } from "./sign-in-again-link";

/**
 * The Delete account form on `/account` (spec 0033, child 0036; AC-12;
 * prompts/mobile-account-deletion.md, decision 7).
 *
 * The button stays disabled until the field holds exactly `DELETE`, the same
 * rule the app and the server apply, and while the action runs. A failure
 * shows the action's message in place; only a confirmed delete leaves the
 * page (AGENTS.md section 11).
 */
function DeleteAccountForm() {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    deleteAccountAction,
    IDLE_STATE,
  );
  const [typed, setTyped] = useState("");
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <AuthFeedback state={state} />
      <SignInAgainLink state={state} />
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-foreground">
          {DELETE_ACCOUNT_COPY.confirmLabel}
        </label>
        <Input
          id={id}
          name="confirm"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      <DeleteButton armed={typed === DELETE_ACCOUNT_CONFIRM_WORD} />
    </form>
  );
}

/** Reads the form's pending state, which only a child of the form can see. */
function DeleteButton({ armed }: { armed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="destructive"
      size="lg"
      disabled={!armed || pending}
      className="w-full"
    >
      {pending ? "Deleting…" : DELETE_ACCOUNT_COPY.button}
    </Button>
  );
}

export { DeleteAccountForm };
