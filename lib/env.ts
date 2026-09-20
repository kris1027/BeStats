import { z } from "zod";

/**
 * Environment variables that are deliberately public.
 *
 * `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time, so
 * only values that are safe to publish may live here. The Supabase publishable
 * key is one of them: it is the key the browser client is meant to use, and
 * Row Level Security, not secrecy, is what protects user data (AGENTS.md
 * sections 5 and 11). The service role key and the TMDB token are server only
 * and must never be added to this file.
 *
 * Each `process.env.X` is read as a literal property access, because Next.js
 * replaces those literals at build time and a dynamic lookup would resolve to
 * `undefined` in the browser.
 *
 * Validation is lazy rather than at module load, so `pnpm build` succeeds in an
 * environment with no Supabase project configured. A missing or malformed value
 * fails loudly the first time a client is actually created.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .url(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid URL, for example https://abcdefgh.supabase.co",
    )
    // The Supabase dashboard shows a RESTful endpoint ending in /rest/v1/, but
    // the client libraries append their own paths (/auth/v1, /rest/v1) to this
    // value. Pasting the RESTful form produces confusing PostgREST 404s on
    // every auth call, so reject a path outright rather than let it through.
    .refine(
      (value) => {
        const path = new URL(value).pathname;
        return path === "" || path === "/";
      },
      {
        message:
          "NEXT_PUBLIC_SUPABASE_URL must be the project root URL with no path. Remove the trailing /rest/v1/ that the dashboard displays.",
      },
    ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    // Report which variables are wrong, never their values.
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Invalid public environment configuration. ${problems}. Copy .env.example to .env.local and fill it in.`,
    );
  }

  return parsed.data;
}
