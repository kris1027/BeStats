import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthPanel } from "@/components/auth/auth-panel";
import { Skeleton } from "@/components/skeleton";
import { isSafeNextPath } from "@/lib/auth/next-path";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create an account",
};

/**
 * `/sign-up` (spec 0005, AC-1).
 *
 * Shell static, form behind a Suspense boundary, for the same reason as
 * `/sign-in`: the form needs the `next` value from the query string, and
 * reading it makes a component request scoped.
 *
 * The Google button the sign in artboard draws is absent here too. Feature 20
 * restores it to both pages in the slot this leaves above the fields.
 */
export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <AuthPanel
      title="Create an account"
      description="Start keeping track of what you watch."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="rounded-sm font-semibold text-foreground hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <SignUpFormSlot searchParams={searchParams} />
      </Suspense>
    </AuthPanel>
  );
}

/** Validates `next` before it reaches the hidden field; checked again server side. */
async function SignUpFormSlot({
  searchParams,
}: {
  searchParams: PageProps<"/sign-up">["searchParams"];
}) {
  const params = await searchParams;
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
