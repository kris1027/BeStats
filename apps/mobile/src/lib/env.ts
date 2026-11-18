import { z } from "zod";

/**
 * The app's public configuration (spec 0033, child 0036). Every value here is
 * public by design: `EXPO_PUBLIC_*` values are inlined into the bundle, so no
 * TMDB, IGDB or service role secret may ever be added
 * (`security-boundary.test.ts`; spec 0033, AC-3). Row Level Security, not
 * secrecy, protects user data.
 *
 * Each `process.env.EXPO_PUBLIC_X` is read as a literal property access,
 * because Expo replaces those literals at build time. Validation is lazy, so
 * a missing value fails with a message naming the variable the first time a
 * client is built, never its value.
 */
const publicEnvSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  EXPO_PUBLIC_API_BASE_URL: z
    .url()
    .transform((value) => value.replace(/\/+$/, "")),
  EXPO_PUBLIC_AUTH_EMAIL_DELIVERY: z.enum(["on", "off"]).default("off"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | null = null;

/**
 * Reads and validates the public environment once.
 *
 * @throws When a variable is missing or malformed; the message names it.
 */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicEnvSchema.safeParse({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_AUTH_EMAIL_DELIVERY:
      process.env.EXPO_PUBLIC_AUTH_EMAIL_DELIVERY,
  });
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new Error(
      `Invalid app configuration: ${names.join(", ")}. Copy apps/mobile/.env.example to .env.local and fill it in.`,
    );
  }
  cached = parsed.data;
  return cached;
}
