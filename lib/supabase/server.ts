import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";

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
 */
export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
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
