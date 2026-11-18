import { z } from "zod";

import { AUTH_OUTCOME, authMessage } from "./messages";

/**
 * The username rules, defined once on the app side (prompts/account-username.md).
 *
 * The database enforces the same rules on `profiles` for every writer, so the
 * values below exist to give the forms a precise message before a round trip.
 * The two copies must stay equal: `lib/auth/username.test.ts` reads the schema file
 * and fails if the format rules or the reserved list drift apart, the same
 * way the password minimum is checked against `supabase/config.toml`.
 *
 * Deliberately pure and not `server-only`, so the sign up form, the account
 * form and the tests share one copy.
 */
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 30;

/** A rolling week. The database uses `interval '7 days'`. */
export const USERNAME_CHANGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Names nobody may take, compared ignoring case.
 *
 * Kept short on purpose: it guards against someone posing as the app or its
 * operator, not against every word a person might dislike.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "bestats",
  "system",
  "moderator",
  "staff",
  "official",
  "tmdb",
  "api",
  "account",
  "null",
  "undefined",
];

/** The hint under both username inputs. */
export const USERNAME_HINT = `${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters: letters, numbers, _ . -`;

/**
 * A username being chosen.
 *
 * ASCII only, so no two names can look alike and no invisible character can
 * hide in one. A reserved name is refused with the same words as a taken one,
 * so probing the form does not reveal the list a name at a time.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(
    USERNAME_MIN_LENGTH,
    `Your username needs at least ${USERNAME_MIN_LENGTH} characters.`,
  )
  .max(
    USERNAME_MAX_LENGTH,
    `Your username can have at most ${USERNAME_MAX_LENGTH} characters.`,
  )
  .regex(/^\S+$/, "Your username can't contain spaces.")
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    "Use only letters, numbers, underscores, dots and dashes.",
  )
  .regex(/^[^.-](.*[^.-])?$/, "Your username can't start or end with . or -.")
  .refine(
    (value) => !RESERVED_USERNAMES.includes(value.toLowerCase()),
    authMessage(AUTH_OUTCOME.usernameTaken),
  );

/**
 * When a username set at `changedAt` may next be changed.
 *
 * Rolling, not calendar based, matching the trigger that enforces it. The
 * database stays the judge: this only decides what the form shows.
 */
export function usernameUnlocksAt(changedAt: Date): Date {
  return new Date(changedAt.getTime() + USERNAME_CHANGE_INTERVAL_MS);
}

/** Whether the weekly lock still holds at `now`. */
export function isUsernameLocked(changedAt: Date, now: Date): boolean {
  return usernameUnlocksAt(changedAt).getTime() > now.getTime();
}
