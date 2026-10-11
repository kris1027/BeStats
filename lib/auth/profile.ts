import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { AUTH_EVENT, logAuthEvent } from "./log";
import { AUTH_OUTCOME } from "./messages";
import { getOptionalUser } from "./user";

/** The signed in account's own profile (prompts/account-username.md). */
export type OwnProfile = {
  username: string;
  usernameChangedAt: Date;
};

/**
 * Reads the signed in account's profile, or null.
 *
 * Null covers three cases the callers treat alike: signed out, no username
 * chosen yet, and a failed read. The navbar is on every page, so a database
 * hiccup must cost the person their username for one render, never the page;
 * the failure is logged by class only, with no user data.
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("username, username_changed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    logAuthEvent(AUTH_EVENT.readProfile, "error", AUTH_OUTCOME.unexpected);
    return null;
  }
  if (!data) return null;

  return {
    username: data.username,
    usernameChangedAt: new Date(data.username_changed_at),
  };
}
