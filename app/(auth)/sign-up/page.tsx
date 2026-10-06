import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthCrossLink } from "@/components/auth/auth-cross-link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { AuthUnavailableNotice } from "@/components/auth/auth-unavailable-notice";
import { LEGAL_LINK_CLASS } from "@/components/legal/legal-document";
import { Skeleton } from "@/components/skeleton";
import { isSafeNextPath } from "@/lib/auth/next-path";
import { publicEnvProblems } from "@/lib/env";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create an account",
};

/**
 * `/sign-up` (spec 0005, AC-1).
 *
 * Shell static, form behind a Suspense boundary, for the same reason as
 * `/sign-in`: the form needs the `next` value from the query string, and
 * reading it makes a component request scoped. The footer link carries `next`
 * back to sign in through its own boundary, for the same reason (AC-10).
 *
 * The Google button the sign in design has a slot for is absent here too. Feature 20
 * restores it to both pages in the slot this leaves above the fields.
 *
 * The terms line sits outside the form's boundary, so it is in the static
 * shell and does not shift when the form streams in, and below the whole form
 * area, so it covers the Google button too. It is a notice, not a checkbox:
 * nothing is stored and the sign up action is unchanged (spec 0017, AC-14).
 */
export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <AuthPanel
      title="Create an account"
      description="Start keeping track of what you watch."
      footer={
        <>
          Already have an account?{" "}
          <AuthCrossLink href="/sign-in" searchParams={searchParams}>
            Sign in
          </AuthCrossLink>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <SignUpFormSlot searchParams={searchParams} />
      </Suspense>
      <p className="text-xs text-muted-foreground">
        By creating an account, you agree to the{" "}
        <Link href="/terms" className={LEGAL_LINK_CLASS}>
          Terms of Service
        </Link>{" "}
        and acknowledge the{" "}
        <Link href="/privacy" className={LEGAL_LINK_CLASS}>
          Privacy Policy
        </Link>
        .
      </p>
    </AuthPanel>
  );
}

/**
 * Validates `next` before it reaches the hidden field; checked again server
 * side. With no Supabase configuration on this deployment (a Vercel preview),
 * shows the notice instead of the form, as `/sign-in` does (spec 0018, AC-21).
 */
async function SignUpFormSlot({
  searchParams,
}: {
  searchParams: PageProps<"/sign-up">["searchParams"];
}) {
  const params = await searchParams;
  if (publicEnvProblems()) return <AuthUnavailableNotice />;
  const next = typeof params.next === "string" ? params.next : undefined;

  return <SignUpForm next={isSafeNextPath(next) ? next : undefined} />;
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton shape="line" className="h-5 w-16" />
      <Skeleton shape="line" className="h-14 rounded-2xl" />
      <Skeleton shape="line" className="h-5 w-24" />
      <Skeleton shape="line" className="h-14 rounded-2xl" />
      <Skeleton shape="line" className="h-14 rounded-full" />
    </div>
  );
}
