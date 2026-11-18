import "server-only";

import { refresh } from "next/cache";
import type { z } from "zod";

import { getOptionalUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

import {
  logTrackingEvent,
  type TrackingEvent,
  type TrackingOutcome,
} from "./log";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * What a write step returns: PostgREST's typed data, and its error or null on
 * success. `D` is the generated return type of the call, so the reader that
 * consumes it is checked against `database.types.ts`.
 */
export type WriteStep<D> = (
  supabase: SupabaseClient,
  userId: string,
) => PromiseLike<{ data: D | null; error: { code?: string | null } | null }>;

/**
 * The shared order of every movie and game tracking action once its input is
 * parsed (spec 0007, spec 0026, AC-10): the verified session, then the
 * catalog check, then the write through Row Level Security, then `refresh()`
 * on success only. One copy, so the two media types can never drift apart on
 * the order or on what reaches a log line.
 *
 * It never throws: every failure is returned, so it reaches a toast rather
 * than an error boundary. `user_id` is always the session's, never an
 * argument (`AGENTS.md` section 5). The show and episode actions keep their
 * own runner, because their bodies interleave TMDB reads with several writes.
 *
 * @param options.event The log event for a refusal.
 * @param options.check The catalog check, run after the session: a refusal,
 * or null to go on. Absent for a write that must work whatever the catalog
 * says (a removal, a cleared score, a restore).
 * @param options.write The Supabase call, given the request client and the
 * user id.
 * @param options.classify Maps a PostgREST error to the class the client sees
 * and the outcome the log records.
 * @param options.read For a write whose row carries something back (what it
 * cleared, an Undo), reads it from the data.
 * @returns `value` is what `read` found, or undefined.
 */
export async function runTrackingWrite<D, R, E extends TrackingOutcome>({
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
}): Promise<
  | { ok: true; value: R | undefined }
  | { ok: false; error: E | "session_expired" | "write_failed" }
> {
  let value: R | undefined;
  try {
    const user = await getOptionalUser();
    if (!user) {
      logTrackingEvent(event, "session_expired");
      return { ok: false, error: "session_expired" };
    }

    const refusal = check ? await check() : null;
    if (refusal) {
      logTrackingEvent(event, refusal);
      return { ok: false, error: refusal };
    }

    const supabase = await createClient();
    const { data, error } = await write(supabase, user.id);
    if (error) {
      const classified = classify(error);
      logTrackingEvent(event, classified.outcome);
      return { ok: false, error: classified.error };
    }
    value = read?.(data);
  } catch {
    // A network failure inside supabase-js, or a bug the catalog check
    // rethrew. The error object is dropped on purpose: its message can carry
    // request details that must not reach a log line (spec 0007, AC-21;
    // spec 0026, AC-15).
    logTrackingEvent(event, "db_error");
    return { ok: false, error: "write_failed" };
  }

  refresh();
  return { ok: true, value };
}

/**
 * Parses a tracking action's arguments, or logs `invalid_input` and returns
 * null (spec 0007, AC-13; spec 0026, AC-15). A Server Action is a public
 * endpoint, so its arguments are external input (`AGENTS.md` section 11).
 */
export function parseTrackingInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  event: TrackingEvent,
): T | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  logTrackingEvent(event, "invalid_input");
  return null;
}
