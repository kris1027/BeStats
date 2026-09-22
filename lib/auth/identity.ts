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
