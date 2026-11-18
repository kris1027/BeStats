import Link from "next/link";

import type { AuthActionState } from "@/lib/auth/action-state";
import { AUTH_OUTCOME } from "@/lib/auth/messages";

/**
 * The way forward under an `/account` form whose session ended
 * (spec 0005, AC-17).
 *
 * A write that did not happen must never look like one that did, and the
 * message must come with a way out. `next` carries this page, so signing in
 * again lands back here rather than on the catalog. Shared by both forms so
 * the link and its target cannot drift apart.
 */
export function SignInAgainLink({ state }: { state: AuthActionState }) {
  if (state.outcome !== AUTH_OUTCOME.sessionExpired) return null;

  return (
    <Link
      href={`/sign-in?next=${encodeURIComponent("/account")}`}
      className="rounded-sm text-sm text-text-link hover:text-foreground hover:underline"
    >
      Sign in again
    </Link>
  );
}
