import "server-only";

import type { Database } from "@bestats/core/supabase/database.types";
import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";
import { withJwtSkewRetry } from "@/lib/supabase/jwt-skew-retry";
import type { TrackingClient } from "@/lib/tracking/commands/run";

/** A caller `/api/v1/me/*` verified from its bearer token. */
export type BearerUser = {
  /** The verified `sub` claim, never anything the request said. */
  userId: string;
  /** A client acting as that user under Row Level Security. */
  client: TrackingClient;
};

/** Three base64url segments, the only shape a Supabase access token has. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/**
 * The token from an `Authorization: Bearer <jwt>` header, or null for any
 * other shape (spec 0033, child 0035, Bearer auth). Every server operation
 * rechecks the session, so a malformed header never reaches Supabase
 * (AGENTS.md section 11).
 *
 * @param header The raw header value, or null when absent.
 */
export function readBearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer (\S+)$/);
  const token = match?.[1];
  return token && JWT_SHAPE.test(token) ? token : null;
}

/**
 * The single place a v1 route learns who is asking (spec 0033, child 0035;
 * AGENTS.md sections 5 and 11). The phone has no cookie, so it sends the
 * Supabase access token it holds, and this verifies it on the server.
 *
 * The client uses the publishable key with the caller's token as its
 * `Authorization`, so every query runs as that user and Row Level Security
 * still applies: this is never an elevated client. `getClaims(jwt)` verifies
 * the token (locally with asymmetric keys, otherwise by asking Supabase Auth),
 * and only an `authenticated` role passes, which also refuses the publishable
 * key presented as a token. An expired token fails verification.
 *
 * It never throws and never logs the token: any failure is simply null, which
 * the route answers with 401.
 *
 * @param authorization The request's `Authorization` header.
 * @returns The verified user and its client, or null.
 */
export async function verifyBearer(
  authorization: string | null,
): Promise<BearerUser | null> {
  const token = readBearerToken(authorization);
  if (!token) return null;

  try {
    const env = getPublicEnv();
    const client = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: withJwtSkewRetry(fetch),
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    );

    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims) return null;

    const { sub, role } = data.claims;
    if (role !== "authenticated") return null;
    if (typeof sub !== "string" || sub.length === 0) return null;

    return { userId: sub, client };
  } catch {
    return null;
  }
}
