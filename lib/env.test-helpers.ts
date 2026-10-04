import { vi } from "vitest";

import type { PublicEnv } from "./env";

type PublicEnvName = keyof PublicEnv;

/**
 * Every variable `getPublicEnv()` validates. Typed against `PublicEnv` so a
 * name that drifts from the schema in `lib/env.ts` fails the type check rather
 * than leaving one variable silently unstubbed in a test.
 */
const PUBLIC_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const satisfies readonly PublicEnvName[];

/** A complete local configuration that passes the `lib/env.ts` schema. */
export const CONFIGURED_PUBLIC_ENV: Readonly<Record<PublicEnvName, string>> = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

/**
 * Stubs every public auth variable at once, so a test states exactly which
 * configuration it runs under and a value from the developer's `.env.local`
 * can never leak in. Any variable missing from `values` is stubbed to
 * undefined, which is how a partial configuration is expressed. Pair with
 * `vi.unstubAllEnvs()` in `afterEach`.
 *
 * @param values Defaults to a complete, valid configuration.
 */
export function stubPublicEnv(
  values: Partial<Record<PublicEnvName, string>> = CONFIGURED_PUBLIC_ENV,
): void {
  for (const name of PUBLIC_ENV_NAMES) {
    vi.stubEnv(name, values[name]);
  }
}

/**
 * No auth configuration at all, the shape of a Vercel preview (spec 0018,
 * AC-21), where the app must fall back to signed out instead of failing.
 */
export function stubNoPublicEnv(): void {
  stubPublicEnv({});
}
