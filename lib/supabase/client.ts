import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

/**
 * Supabase client for Client Components.
 *
 * Cookie handling is left to `@supabase/ssr`, which the library recommends: it
 * reads and writes `document.cookie` itself so the session a Server Component
 * reads and the session the browser holds stay the same.
 */
export function createClient() {
  const env = getPublicEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
