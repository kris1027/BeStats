import "server-only";

import { AUTH_OUTCOME } from "@bestats/core/auth/messages";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { type ProfileRow, readProfileRow } from "./commands/username";
import { AUTH_EVENT, logAuthEvent } from "./log";
import { getOptionalUser } from "./user";

/** The signed in account's own profile (prompts/account-username.md). */
export type OwnProfile = ProfileRow;

/**
 * Reads the signed in account's profile, or null.
 *
 * Null covers three cases the callers treat alike: signed out, no username
 * chosen yet, and a failed read. The navbar is on every page, so a database
 * hiccup must cost the person their username for one render, never the page;
 * the failure is logged by class only, with no user data. The row read itself
 * is `readProfileRow`, which `/api/v1/me/profile` shares.
 *
 * Memoized per request with React `cache()`, because the navbar renders two
 * account slots and `/account` reads it too. Row level security limits the
 * read to the caller's own row; the `user_id` filter only lets the query use
 * the primary key.
 */
export const getOwnProfile = cache(readOwnProfile);

async function readOwnProfile(): Promise<OwnProfile | null> {
  const user = await getOptionalUser();
  if (!user) return null;

  const read = await readProfileRow({
    userId: user.id,
    getClient: createClient,
  });
  if (!read.ok) {
    logAuthEvent(AUTH_EVENT.readProfile, "error", AUTH_OUTCOME.unexpected);
    return null;
  }
  return read.row;
}
