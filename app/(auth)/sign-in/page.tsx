import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCrossLink } from "@/components/auth/auth-cross-link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { Skeleton } from "@/components/skeleton";
import {
  AUTH_MESSAGES,
  type AuthOutcome,
  authMessage,
  SIGN_IN_NOTICES,
  type SignInNotice,
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
 * shell, so the boundary keeps the card and the heading prerendered and
 * streams only the form.
 *
 * The footer link needs `next` too, so a detour through sign up still lands on
 * the page that asked for sign in (AC-10). It has its own boundary rather than
 * moving inside the form's, whose fallback is the same link without `next`, so
 * the footer paints in the static shell and nothing shifts when it resolves.
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthPanel
      title="Welcome back"
      description="Sign in to keep track of what you watch."
      footer={
        <>
          New to BeStats?{" "}
          <AuthCrossLink href="/sign-up" searchParams={searchParams}>
            Create an account
          </AuthCrossLink>
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
 * `error` and `notice` are only ever codes this app emitted, looked up in their
 * message tables. Rendering the query string itself would let anyone put
 * arbitrary text on the sign in page and hand out the link. `notice` is how a
 * completed password reset says so here (AC-8). The lookup checks own keys
 * only: `in` also finds `toString` and `constructor`, which would put an empty
 * message band on the page.
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
    errorCode && Object.hasOwn(AUTH_MESSAGES, errorCode)
      ? authMessage(errorCode as AuthOutcome)
      : undefined;
  const noticeCode =
    typeof params.notice === "string" ? params.notice : undefined;
  const initialNotice =
    noticeCode && Object.hasOwn(SIGN_IN_NOTICES, noticeCode)
      ? SIGN_IN_NOTICES[noticeCode as SignInNotice]
      : undefined;

  return (
    <SignInForm
      next={isSafeNextPath(next) ? next : undefined}
      initialError={initialError}
      initialNotice={initialNotice}
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
