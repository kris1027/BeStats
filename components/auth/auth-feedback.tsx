"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { AuthActionState } from "@/lib/auth/action-state";

/**
 * The form level message an auth action returned (spec 0005, AC-21).
 *
 * `role="alert"` on the error so assistive technology announces it as soon as
 * it appears, rather than leaving someone who cannot see the red text
 * wondering why the form did nothing. A success uses `status`, which announces
 * politely without interrupting.
 *
 * Nothing is rendered in the idle state, so the layout does not reserve an
 * empty band that shifts when a message arrives.
 */
function AuthFeedback({ state }: { state: AuthActionState }) {
  if (state.status === "idle" || !state.message) return null;

  const isError = state.status === "error";

  return (
    <p
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
          : "rounded-md bg-muted px-4 py-3 text-sm text-foreground"
      }
    >
      {state.message}
    </p>
  );
}

/**
 * The submit button, disabled while the action is in flight.
 *
 * `useFormStatus` reads the pending state of the enclosing form, which is why
 * this is a separate component: read in the form itself it would always be
 * false. Disabling it is what stops a double submit creating two accounts or
 * burning two of the two emails per hour the rate limit allows.
 *
 * The label changes while pending rather than showing a spinner alone, so the
 * state is announced, not only drawn.
 */
function AuthSubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="selected"
      size="lg"
      disabled={pending}
      className="w-full"
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

export { AuthFeedback, AuthSubmitButton };
