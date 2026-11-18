import Link from "next/link";
import type * as React from "react";
import { Suspense } from "react";

import { isSafeNextPath } from "@/lib/auth/next-path";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The footer link between `/sign-in` and `/sign-up`, carrying `next` across
 * (spec 0005, AC-10).
 *
 * Someone sent to sign in from a private page who then creates an account
 * should still land on that page. Everything downstream of sign up already
 * carries `next`; this link was the one place it was dropped.
 *
 * The footer sits outside the Suspense boundary that streams the form, which
 * is what keeps the card prerendered, so it gets a boundary of its own. The
 * fallback is the same link without `next`: identical to look at, so nothing
 * shifts, and still a working link if the query string never resolves.
 */
function AuthCrossLink({
  href,
  searchParams,
  children,
}: {
  href: "/sign-in" | "/sign-up";
  searchParams: SearchParams;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<CrossLink href={href}>{children}</CrossLink>}>
      <CrossLinkWithNext href={href} searchParams={searchParams}>
        {children}
      </CrossLinkWithNext>
    </Suspense>
  );
}

/**
 * Reads `next` and appends it only when it passes the same check the forms
 * use, so an unsafe value is never echoed into a link (AC-11).
 */
async function CrossLinkWithNext({
  href,
  searchParams,
  children,
}: {
  href: "/sign-in" | "/sign-up";
  searchParams: SearchParams;
  children: React.ReactNode;
}) {
  const { next } = await searchParams;
  const target =
    typeof next === "string" && isSafeNextPath(next)
      ? `${href}?next=${encodeURIComponent(next)}`
      : href;

  return <CrossLink href={target}>{children}</CrossLink>;
}

function CrossLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-sm font-semibold text-foreground hover:underline"
    >
      {children}
    </Link>
  );
}

export { AuthCrossLink };
