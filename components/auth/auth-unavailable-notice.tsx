import { AUTH_UNCONFIGURED_MESSAGE } from "@/lib/auth/messages";

/**
 * Stands in for the sign in and sign up forms when this deployment has no
 * Supabase configuration, as on a Vercel preview (spec 0018, AC-21).
 *
 * The same band `AuthFeedback` draws for a success, so it reads as a calm
 * notice rather than an error. `status` announces it politely.
 */
export function AuthUnavailableNotice() {
  return (
    <p
      role="status"
      className="rounded-md bg-muted px-4 py-3 text-sm text-foreground"
    >
      {AUTH_UNCONFIGURED_MESSAGE}
    </p>
  );
}
