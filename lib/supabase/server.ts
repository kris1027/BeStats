import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * A new client is created per request and never shared across requests, because
 * it carries that request's cookies.
 *
 * `cookies()` is asynchronous in Next.js 16, so this function is async.
 *
 * This client uses the publishable key and therefore runs as the signed in user,
 * under Row Level Security. It is not an elevated client and must not be
 * replaced with one for ordinary user operations (AGENTS.md section 5).
 *
 * Typed with the generated `Database`, so every read and write of the tracking
 * tables is checked against the real schema. Regenerate with `pnpm db:types`
 * after any schema change; `pnpm db:types:check` fails when the two drift.
 *
 * Its cookies are `HttpOnly` through `sessionCookieOptions()`, the same
 * definition the proxy uses (spec 0005, AC-25).
 */
export async function createClient() {
  // `cookies()` comes first so a prerender postpones here, before the env is
  // validated. The other order throws during `pnpm build` on a machine with no
  // Supabase project configured, which is exactly what CI is.
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: sessionCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // A Server Component cannot set cookies. That is expected: the
            // proxy refreshes the session on every request, so the write it
            // attempts here is already covered.
          }
        },
      },
    },
  );
}
