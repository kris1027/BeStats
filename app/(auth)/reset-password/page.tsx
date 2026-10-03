import type { Metadata } from "next";
import Link from "next/link";

import { AuthPanel } from "@/components/auth/auth-panel";
import { RECOVERY_UNAVAILABLE_MESSAGE } from "@/lib/auth/messages";
import { getAuthEmailDelivery } from "@/lib/env";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
};

/**
 * `/reset-password`, where a recovery link lands (spec 0005, AC-7, AC-8).
 *
 * The page does not check for the recovery session itself. Doing so here would
 * be a redirect, which is convenience, not a boundary; the action rechecks and
 * refuses regardless, which is what actually protects the write. It also keeps
 * the route prerendered, since nothing on it reads a request scoped value.
 *
 * The callback never honours a `next` value for a recovery link, so a person
 * following one always arrives here and nowhere else.
 *
 * While the deployment sends no email no recovery link exists to land here,
 * so the page shows the same notice as `/forgot-password` and no form (spec
 * 0018, AC-13).
 */
export default function ResetPasswordPage() {
  if (getAuthEmailDelivery() === "off") {
    return (
      <AuthPanel
        title="Set a new password"
        description={RECOVERY_UNAVAILABLE_MESSAGE}
        footer={
          <Link
            href="/sign-in"
            className="rounded-sm font-semibold text-foreground hover:underline"
          >
            Back to sign in
          </Link>
        }
      >
        {null}
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Set a new password"
      description="Choose a new password for your account. Saving it signs you out everywhere, then you sign in with the new one."
    >
      <ResetPasswordForm />
    </AuthPanel>
  );
}
