import {
  AUTH_PANEL_COPY,
  RECOVERY_UNAVAILABLE_MESSAGE,
} from "@bestats/core/auth/messages";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { getAuthEmailDelivery } from "@/lib/env";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
};

/**
 * `/forgot-password` (spec 0005, AC-7).
 *
 * No Suspense boundary here, unlike the other auth screens: this form carries
 * no `next` value, so nothing on the page reads the query string and the whole
 * route prerenders.
 *
 * While the deployment sends no email, the form gives way to a notice saying
 * so and naming the address to write to (spec 0018, AC-13). The flag is
 * inlined at build time, so this choice is prerendered too.
 */
export default function ForgotPasswordPage() {
  const emailDelivery = getAuthEmailDelivery();

  return (
    <AuthPanel
      title={AUTH_PANEL_COPY.forgotPassword.title}
      description={
        emailDelivery === "on"
          ? AUTH_PANEL_COPY.forgotPassword.description
          : RECOVERY_UNAVAILABLE_MESSAGE
      }
      footer={
        <Link
          href="/sign-in"
          className="rounded-sm font-semibold text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      {emailDelivery === "on" ? <ForgotPasswordForm /> : null}
    </AuthPanel>
  );
}
