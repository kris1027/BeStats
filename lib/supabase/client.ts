import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for Client Components.
 *
 * Cookie handling is left to `@supabase/ssr`, which the library recommends: it
 * reads and writes `document.cookie` itself so the session a Server Component
 * reads and the session the browser holds stay the same.
 *
 * Typed with the generated `Database` so a query against a column that does not
 * exist fails at compile time rather than at runtime. AGENTS.md section 11
 * keeps this client to authentication only; it never reads the tracking tables.
 *
 * It cannot see the session: the server writes the session cookie `HttpOnly`,
 * so `document.cookie` never holds it (spec 0005, AC-25). A feature that needs
 * this client with a session has to reopen that criterion in its own spec.
 */
export function createClient() {
  const env = getPublicEnv();

  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
