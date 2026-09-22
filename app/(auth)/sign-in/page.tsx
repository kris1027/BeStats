import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthPanel } from "@/components/auth/auth-panel";
import { Skeleton } from "@/components/skeleton";
import {
  AUTH_MESSAGES,
  type AuthOutcome,
  authMessage,
} from "@/lib/auth/messages";
import { isSafeNextPath } from "@/lib/auth/next-path";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * `/sign-in`, built from `design/desktop-sign-in-page.svg` and its mobile pair
 * (spec 0005, AC-4, AC-21).
 *
 * The page shell is static and the form sits behind a Suspense boundary,
 * because the form needs `searchParams` (`next`, and the `error` the callback
 * redirects with) and reading those makes a component request scoped. Under
 * `cacheComponents` that would otherwise pull the whole route out of the static
 * shell, so the boundary keeps the card, the heading and the footer link
 * prerendered and streams only the form.
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthPanel
      title="Welcome back"
      description="Sign in to keep track of what you watch."
      footer={
        <>
          New to BeStats?{" "}
          <Link
            href="/sign-up"
            className="rounded-sm font-semibold text-foreground hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<SignInFormSkeleton />}>
        <SignInFormSlot searchParams={searchParams} />
      </Suspense>
    </AuthPanel>
  );
}

/**
 * Reads the query string and hands the form its starting state.
 *
 * `next` is validated here and dropped when it fails, so an unsafe value never
 * reaches the hidden field in the first place. It is checked again in the
 * action, because this check protects nothing on its own (AC-11).
 *
 * `error` is only ever a code this app emitted, looked up in the message table.
 * Rendering the query string itself would let anyone put arbitrary text on the
 * sign in page and hand out the link.
 */
async function SignInFormSlot({
  searchParams,
}: {
  searchParams: PageProps<"/sign-in">["searchParams"];
}) {
  const params = await searchParams;

  const next = typeof params.next === "string" ? params.next : undefined;
  const errorCode = typeof params.error === "string" ? params.error : undefined;
  const initialError =
    errorCode && errorCode in AUTH_MESSAGES
      ? authMessage(errorCode as AuthOutcome)
      : undefined;

  return (
    <SignInForm
      next={isSafeNextPath(next) ? next : undefined}
      initialError={initialError}
    />
  );
}

/** The form's footprint while the query string resolves, so nothing jumps. */
function SignInFormSkeleton() {
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
