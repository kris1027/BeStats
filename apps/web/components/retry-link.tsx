import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";

/**
 * The "Try again" action on a TMDB failure panel (spec 0006, AC-10).
 *
 * A plain `<a>` on purpose, not `next/link`. A client navigation to the same
 * URL can be answered from the router cache, which would replay the failure the
 * visitor is trying to get past. A full page load always reaches the server,
 * and the failure itself is only cached for seconds (`failureProfile` in
 * `lib/tmdb/result.ts`), so the retry really retries. It also works with
 * JavaScript off.
 *
 * @param href The URL to reload, built on the server from the route's params,
 * so it is always the page the visitor is on.
 */
function RetryLink({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      data-slot="retry-link"
      className={cn(buttonVariants({ size: "touch" }), className)}
    >
      Try again
    </a>
  );
}

export { RetryLink };
