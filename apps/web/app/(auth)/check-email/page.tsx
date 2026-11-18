import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthPanel } from "@/components/auth/auth-panel";
import { Skeleton } from "@/components/skeleton";
import { isSafeNextPath } from "@/lib/auth/next-path";
import { emailSchema } from "@/lib/auth/schemas";
import { ResendForm } from "./resend-form";

export const metadata: Metadata = {
  title: "Check your email",
};

/**
 * `/check-email`, where both branches of sign up land (spec 0005, AC-1, AC-2).
 *
 * A new address and an address that already has an account arrive here
 * identically, and this page cannot tell which happened, because it is only
 * given the address. That is the point: a page that knew would eventually show
 * it.
 *
 * The copy is conditional ("if that address needed confirming") rather than a
 * claim that a message was sent, since for a taken address none was. It reveals
 * nothing and still tells no lie.
 */
export default function CheckEmailPage({
  searchParams,
}: PageProps<"/check-email">) {
  return (
    <AuthPanel
      title="Check your email"
      description="If that address needed confirming, a link is on its way. Open it to finish setting up your account."
      footer={
        <Link
          href="/sign-in"
          className="rounded-sm font-semibold text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <ResendSlot searchParams={searchParams} />
      </Suspense>
    </AuthPanel>
  );
}

/**
 * Echoes the address back only after it passes the same email schema the
 * actions use.
 *
 * Without that check this page would render whatever text a query string
 * carried, which makes it a ready made surface for putting someone else's words
 * on a BeStats page and handing out the link.
 */
async function ResendSlot({
  searchParams,
}: {
  searchParams: PageProps<"/check-email">["searchParams"];
}) {
  const params = await searchParams;

  const parsed = emailSchema.safeParse(params.email);
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <ResendForm
      email={parsed.success ? parsed.data : undefined}
      next={isSafeNextPath(next) ? next : undefined}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton shape="line" className="h-5 w-16" />
      <Skeleton shape="line" className="h-14 rounded-2xl" />
      <Skeleton shape="line" className="h-14 rounded-full" />
    </div>
  );
}
