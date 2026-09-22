import type { Metadata } from "next";

import { AuthPanel } from "@/components/auth/auth-panel";
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
 */
export default function ResetPasswordPage() {
  return (
    <AuthPanel
      title="Set a new password"
      description="Choose a new password for your account. You will be signed in once it is saved."
    >
      <ResetPasswordForm />
    </AuthPanel>
  );
}
