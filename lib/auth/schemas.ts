import { z } from "zod";

/**
 * The password and address rules, defined once (spec 0005, AC-9).
 *
 * The minimum length lives here *and* in `supabase/config.toml`. Two layers is
 * not duplication for its own sake: the Zod check saves a network round trip for
 * the common mistake, and the Supabase setting is what actually enforces it,
 * since a Server Action is not the only thing that can reach the Auth API. The
 * two must be kept equal; the constant is exported so a test can assert it
 * against the config file rather than trusting a comment.
 */
export const MINIMUM_PASSWORD_LENGTH = 8;

/**
 * An email address.
 *
 * Trimmed and lowercased before validation, so `  Kris@Example.COM ` and
 * `kris@example.com` are the same account rather than two. Supabase stores the
 * address lowercased anyway, and doing it here means the address echoed back on
 * `/check-email` matches the one the message went to.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

/**
 * A password being set or changed.
 *
 * Length only. Composition rules (a digit, a symbol) push people towards
 * predictable substitutions without adding real strength, so the breach check
 * Supabase runs is what carries the weight here, and it can only run server
 * side.
 */
export const newPasswordSchema = z
  .string()
  .min(
    MINIMUM_PASSWORD_LENGTH,
    `Your password needs at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
  );

/**
 * A password being offered for a sign in, not set.
 *
 * Only checked for presence. Applying the new password rules to a sign in would
 * tell someone whose old password is seven characters long that their own
 * password is invalid, and it would leak the rule to anyone probing the form.
 */
export const existingPasswordSchema = z.string().min(1, "Enter your password.");

/** `next` is optional everywhere; `isSafeNextPath` judges it, not Zod. */
const nextField = z.string().optional();

export const signInSchema = z.object({
  email: emailSchema,
  password: existingPasswordSchema,
  next: nextField,
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  next: nextField,
});

export const emailOnlySchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: newPasswordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: existingPasswordSchema,
  password: newPasswordSchema,
});
