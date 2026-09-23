/**
 * The values the interface derives from an account (spec 0005, value sourcing).
 *
 * Deliberately pure and deliberately not `server-only`. Both callers are Server
 * Components, but keeping the derivations free of any session or Supabase
 * import is what lets the tests exercise these functions rather than a copy of
 * them, which is the difference between covering the rule and covering a
 * restatement of it.
 *
 * Nothing here is ever stored. That is the whole reason this feature adds no
 * `profiles` table: a value that is recomputed every render cannot drift out of
 * step with the account it came from.
 */

/** Shown beside the avatar: the part of the address before the `@`. */
export function displayName(email: string): string {
  const local = email.split("@")[0];
  return local && local.length > 0 ? local : "Account";
}

/**
 * The single letter in the avatar circle.
 *
 * Falls back rather than returning an empty string, because an empty circle
 * reads as a broken control rather than as an unknown account.
 */
export function avatarLetter(email: string): string {
  return displayName(email).charAt(0).toUpperCase();
}

/**
 * Whether this account has a password to change (AC-16).
 *
 * A provider only account, which feature 20 makes possible by adding Google,
 * carries no identity with provider `email`. Rendering the change password form
 * for it would be a control that cannot work, so the form is left out instead.
 */
export function hasPasswordIdentity(
  identities: readonly { provider: string }[] | null | undefined,
): boolean {
  return identities?.some((identity) => identity.provider === "email") ?? false;
}

/**
 * Whether this session came from a password recovery link (spec 0005, AC-24).
 *
 * `/reset-password` sets a password without asking for the current one, so it
 * must accept only the session a recovery link creates. Without this, anyone
 * holding an ordinary session cookie could set a new password there and the
 * current password check on `/account` (AC-16) would be decorative.
 *
 * Fails closed. Only the object form the installed Auth server actually issues,
 * `[{ method: "recovery", timestamp }]`, passes, and every entry must say
 * `recovery`. An absent or empty claim, any other method, and the bare string
 * form the SDK's type also allows (`["recovery"]`) are all refused: a shape the
 * server was never seen to send is not one to trust with a password write.
 *
 * Takes the claim rather than a client, so it is testable as a pure function,
 * the same reason `hasPasswordIdentity` lives here.
 */
export function isRecoverySession(amr: unknown): boolean {
  return (
    Array.isArray(amr) &&
    amr.length > 0 &&
    amr.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { method?: unknown }).method === "recovery",
    )
  );
}
