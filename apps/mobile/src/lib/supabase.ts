import type { Database } from "@bestats/core/supabase/database.types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { getPublicEnv } from "./env";
import { encryptedSessionStorage } from "./session-storage";
import { installWebCrypto } from "./web-crypto";

let client: SupabaseClient<Database> | null = null;

/**
 * Where the session is stored. Set explicitly so `signOutLocally` can delete
 * it when the library refuses to (prompts/mobile-forced-sign-out.md).
 */
export const SESSION_STORAGE_KEY = "bestats-auth";

/**
 * The app's one Supabase client (spec 0033, child 0036). It holds the session
 * encrypted at rest and is the only thing that ever refreshes it: Supabase
 * rotates refresh tokens, so a second refresher racing it could sign the user
 * out. It uses the publishable key and runs as the signed in user under Row
 * Level Security; the app never holds an elevated key (AGENTS.md section 5).
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;
  // Before the client exists, so its PKCE flow finds SHA-256 and a secure
  // random source (prompts/mobile-deep-links.md, decision 7).
  installWebCrypto();
  const env = getPublicEnv();
  client = createClient<Database>(
    env.EXPO_PUBLIC_SUPABASE_URL,
    env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        storage: encryptedSessionStorage,
        storageKey: SESSION_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    },
  );
  return client;
}

/**
 * Refreshes the session only while the app is in the foreground, as
 * Supabase's React Native guide shows: a backgrounded app gets no timers, so
 * the library would otherwise try to refresh at a moment it cannot finish.
 *
 * @returns A function that stops listening.
 */
export function watchAppStateForRefresh(): () => void {
  const supabase = getSupabase();
  const apply = (state: string) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };
  if (AppState.currentState) apply(AppState.currentState);
  const subscription = AppState.addEventListener("change", apply);
  return () => subscription.remove();
}

/**
 * The access token for one API call: always through `getSession()`, which
 * relies on the library's own lock and refreshes an expired token itself.
 * The only other refresh is `refreshAfterUnauthorized`, after a server 401
 * (child 0036).
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

let refreshing: Promise<string | null> | null = null;

/**
 * A token to retry with after the server refused `rejected` (child 0036).
 *
 * The phone can believe a token is valid that the server refuses (a clock
 * behind, a revoked session), and `getSession()` would hand the same token
 * back. So this refreshes, but only once however many calls failed together:
 * Supabase rotates refresh tokens, and two refreshes racing can sign the user
 * out. A call whose 401 arrives after another call already refreshed takes
 * the new token without refreshing again.
 *
 * @returns The new access token, or null when the session cannot be renewed.
 */
export async function refreshAfterUnauthorized(
  rejected: string,
): Promise<string | null> {
  if (!refreshing) {
    const current = await getAccessToken();
    if (current && current !== rejected) return current;
  }
  refreshing ??= getSupabase()
    .auth.refreshSession()
    .then(({ data }) => data.session?.access_token ?? null)
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Signs out on this phone only, and always succeeds (child 0036; AGENTS.md
 * section 11: an expired session never leaves the app half signed in).
 *
 * supabase-js 2.116 refuses a local sign out when loading the session fails,
 * which is exactly what an expired, revoked session does: it returns the
 * error, keeps the stored session and sends no `SIGNED_OUT` event. Then this
 * deletes the stored session itself, encrypted blob and key alike. Callers
 * set their own signed out state rather than wait for the event.
 */
export async function signOutLocally(): Promise<void> {
  try {
    const { error } = await getSupabase().auth.signOut({ scope: "local" });
    if (!error) return;
  } catch {
    // Falls through to the forced removal below.
  }
  await encryptedSessionStorage.removeItem(SESSION_STORAGE_KEY).catch(() => {});
}
