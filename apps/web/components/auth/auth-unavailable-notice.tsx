import { success } from "@bestats/core/auth/action-state";
import { AUTH_UNCONFIGURED_MESSAGE } from "@bestats/core/auth/messages";
import { AuthFeedback } from "@/components/auth/auth-feedback";

/**
 * Stands in for the sign in and sign up forms when this deployment has no
 * Supabase configuration, as on a Vercel preview (spec 0018, AC-21). The
 * public catalog keeps working there, per the `publicEnvProblems()` fall back
 * in `AGENTS.md` "Commands and repo facts"; only sign in says it is off.
 *
 * Drawn as `AuthFeedback`'s success band rather than a copy of it, so it reads
 * as a calm notice, not an error, and the two cannot drift apart.
 */
export function AuthUnavailableNotice() {
  return <AuthFeedback state={success(AUTH_UNCONFIGURED_MESSAGE)} />;
}
