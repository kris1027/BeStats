import type { Metadata } from "next";
import Link from "next/link";

import { AuthPanel } from "@/components/auth/auth-panel";
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
 */
export default function ForgotPasswordPage() {
  return (
    <AuthPanel
      title="Forgot password"
      description="Enter your address and we will send you a link to set a new password."
      footer={
        <Link
          href="/sign-in"
          className="rounded-sm font-semibold text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthPanel>
  );
}
