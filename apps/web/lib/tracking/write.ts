import "server-only";

import { refresh } from "next/cache";
import type { z } from "zod";

import { getOptionalUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

import { runTrackingCommand, type TrackingDeps } from "./commands/run";
import {
  logTrackingEvent,
  type TrackingEvent,
  type TrackingOutcome,
} from "./log";

export type { WriteStep } from "./commands/run";

/**
 * The Server Action side of every tracking command (spec 0033, child 0035,
 * Shared command layer): the verified cookie session and its client, then the
 * command, then `refresh()` on success only. The v1 routes run the same
 * commands with a bearer session instead, so the two paths share everything
 * but how the user is found.
 *
 * It never throws: an ended session is `session_expired` and writes nothing
 * (spec 0005, AC-17), and a failure building the session is `write_failed`.
 *
 * @param event The log event for a refusal.
 * @param run The command, given the verified user and its client.
 */
export async function withCookieSession<T extends { ok: boolean }>(
  event: TrackingEvent,
  run: (deps: TrackingDeps) => Promise<T>,
): Promise<T | { ok: false; error: "session_expired" | "write_failed" }> {
  let userId: string;
  try {
    const user = await getOptionalUser();
    if (!user) {
      logTrackingEvent(event, "session_expired");
      return { ok: false, error: "session_expired" };
    }
    userId = user.id;
  } catch {
    // The error object is dropped on purpose: its message can carry request
    // details that must not reach a log line (spec 0007, AC-21).
    logTrackingEvent(event, "db_error");
    return { ok: false, error: "write_failed" };
  }

  const deps: TrackingDeps = { userId, getClient: createClient };
  const result = await run(deps);
  if (result.ok) refresh();
  return result;
}

/**
 * The shared order of every movie and game tracking action once its input is
 * parsed (spec 0007, spec 0026, AC-10): the verified session, then
 * `runTrackingCommand` (catalog check, then the write through Row Level
 * Security), then `refresh()` on success only. One copy, so the two media
 * types can never drift apart on the order or on what reaches a log line.
 *
 * The show and episode actions keep their own runner, because their bodies
 * interleave TMDB reads with several writes.
 *
 * @returns `value` is what `read` found, or undefined.
 */
export function runTrackingWrite<D, R, E extends TrackingOutcome>(
  options: Parameters<typeof runTrackingCommand<D, R, E>>[1],
): Promise<
  | { ok: true; value: R | undefined }
  | { ok: false; error: E | "session_expired" | "write_failed" }
> {
  return withCookieSession(options.event, (deps) =>
    runTrackingCommand(deps, options),
  );
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
