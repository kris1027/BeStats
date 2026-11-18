import "server-only";

import type { Database } from "@bestats/core/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  logTrackingEvent,
  type TrackingEvent,
  type TrackingOutcome,
} from "../log";

/**
 * A Supabase client running as the signed in user under Row Level Security:
 * the cookie client for a Server Action, the bearer client for a v1 route.
 * Never an elevated client (AGENTS.md section 5).
 */
export type TrackingClient = SupabaseClient<Database>;

/**
 * What a tracking command needs from its caller (spec 0033, child 0035,
 * Shared command layer). The caller has already verified the session; the
 * command never reads cookies, headers or the session itself, so the Server
 * Action and the v1 route can run the very same code.
 *
 * The client comes from a function so a command builds it only once it is
 * about to write: a catalog refusal then touches no database client at all,
 * as the actions always did.
 */
export type TrackingDeps = {
  userId: string;
  getClient: () => Promise<TrackingClient>;
};

/**
 * What a write step returns: PostgREST's typed data, and its error or null on
 * success. `D` is the generated return type of the call, so the reader that
 * consumes it is checked against `database.types.ts`.
 */
export type WriteStep<D> = (
  supabase: TrackingClient,
  userId: string,
) => PromiseLike<{ data: D | null; error: { code?: string | null } | null }>;

/**
 * The order of every movie and game tracking write once its input is parsed
 * and its session verified (spec 0007, spec 0026, AC-10): the catalog check,
 * then the write through Row Level Security. One copy, so the web action and
 * the v1 route can never drift apart on the order or on what reaches a log
 * line (spec 0033, AC-5).
 *
 * It never throws: every failure is returned. `user_id` is always the
 * verified session's, passed in by the caller, never part of the input
 * (AGENTS.md section 5).
 *
 * @param deps The caller's verified user and its client.
 * @param options.event The log event for a refusal.
 * @param options.check The catalog check: a refusal, or null to go on.
 * Absent for a write that must work whatever the catalog says (a removal, a
 * cleared score, a restore).
 * @param options.write The Supabase call.
 * @param options.classify Maps a PostgREST error to the class the client sees
 * and the outcome the log records.
 * @param options.read For a write whose row carries something back (what it
 * cleared, an Undo), reads it from the data.
 * @returns `value` is what `read` found, or undefined.
 */
export async function runTrackingCommand<D, R, E extends TrackingOutcome>(
  deps: TrackingDeps,
  {
    event,
    check,
    write,
    classify,
    read,
  }: {
    event: TrackingEvent;
    check?: () => Promise<E | null>;
    write: WriteStep<D>;
    classify: (error: { code?: string | null }) => {
      error: E;
      outcome: TrackingOutcome;
    };
    read?: (data: D | null) => R | undefined;
  },
): Promise<
  { ok: true; value: R | undefined } | { ok: false; error: E | "write_failed" }
> {
  try {
    const refusal = check ? await check() : null;
    if (refusal) {
      logTrackingEvent(event, refusal);
      return { ok: false, error: refusal };
    }

    const supabase = await deps.getClient();
    const { data, error } = await write(supabase, deps.userId);
    if (error) {
      const classified = classify(error);
      logTrackingEvent(event, classified.outcome);
      return { ok: false, error: classified.error };
    }
    return { ok: true, value: read?.(data) };
  } catch {
    // A network failure inside supabase-js, or a bug the catalog check
    // rethrew. The error object is dropped on purpose: its message can carry
    // request details that must not reach a log line (spec 0007, AC-21;
    // spec 0026, AC-15).
    logTrackingEvent(event, "db_error");
    return { ok: false, error: "write_failed" };
  }
}
