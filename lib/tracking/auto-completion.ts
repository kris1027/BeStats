import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import {
  getShowEpisodes,
  getTvShow,
  isTmdbNotFound,
  type ShowEpisodes,
  TmdbError,
  type TmdbShowStatus,
} from "@/lib/tmdb";
import {
  type CompletionRow,
  type CompletionTrigger,
  completionVerdict,
  isFinishedShowStatus,
  mayChange,
} from "@/lib/tv/auto-completion";

import { requestTodayUtc } from "./episode-state";
import { logTrackingEvent, TRACKING_EVENT, type TrackingOutcome } from "./log";
import { getShowStatus, getWatchedEpisodeIds, showIdsKey } from "./show-state";
import { classifyTrackingError } from "./supabase-error";
import type { ShowStatusState, TrackingRead, TvStatus } from "./types";

/**
 * Automatic completion, applied (spec 0015, API surface): the server half of
 * `completionVerdict`, run by the episode Server Actions right after a write
 * and by the show page and `/upcoming` before they render.
 *
 * Every write goes through the per request client under the caller's own
 * session, into two `security invoker` functions that fix
 * `status_source = 'system'` in their bodies, so no path here can reach
 * another user's row or bypass Row Level Security (`AGENTS.md` section 11).
 * Nothing here runs inside `use cache`: the watched ids and the row belong to
 * one person; only the TMDB reads go through their shared public cache.
 */

/** What the check changed, if anything. */
type AutoCompletionChange = "completed" | "reopened" | null;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Runs the rule for one show and applies its verdict. Never throws: a TMDB
 * failure, an incomplete read or a failed write changes nothing, and is
 * logged once as `show_tracking.auto_complete` with its outcome class
 * (AC-6, AC-12). The caller's own write, and the page, stand either way.
 *
 * On a `write` trigger it reads as little as it can, stopping at the first
 * step that rules completion out (AC-4): the row, then the show's TMDB
 * status, then the whole episode list. So a tick on an ongoing, paused or
 * dropped show never reads a season.
 *
 * @param showId The show, already validated by the caller.
 * @param trigger What ran the check.
 * @param knownRow The row as the caller already read it this request (a
 * visit), so it is not selected again. A write always selects it fresh, after
 * its own write, because that write may have just started the show.
 * @param knownWatchedIds This show's watched episode ids, when the caller
 * read them for many shows at once (`/upcoming`, one batched read for the
 * page). Otherwise they are read here, after the write.
 */
export async function applyAutoCompletion(
  showId: number,
  trigger: CompletionTrigger,
  knownRow?: CompletionRow,
  knownWatchedIds?: ReadonlySet<number>,
): Promise<{ changed: AutoCompletionChange }> {
  const user = await requireUser();

  try {
    const supabase = await createClient();

    let row: CompletionRow;
    if (knownRow !== undefined) {
      row = knownRow;
    } else {
      const selected = await selectRow(supabase, user.id, showId);
      if (selected.kind === "failed") return failed("db_error");
      row = selected.row;
    }

    if (!mayChange(row, trigger)) return unchanged();

    if (trigger.kind === "write") {
      // The cheap gate: one cached show read before any season (AC-4).
      const status = await readShowStatus(showId);
      if (status.kind === "failed") return failed(status.outcome);
      if (!isFinishedShowStatus(status.status)) return unchanged();
    }

    const [episodes, watchedIds] = await Promise.all([
      readEpisodes(showId),
      knownWatchedIds ?? readWatchedIds(showId),
    ]);
    if (episodes.kind === "failed") return failed(episodes.outcome);
    if (!episodes.read.complete) return failed("incomplete");
    if (watchedIds === null) return failed("db_error");

    const verdict = completionVerdict(
      episodes.read,
      row,
      trigger,
      watchedIds,
      requestTodayUtc(),
    );

    if (verdict.kind === "reopen") {
      const { data, error } = await supabase.rpc("reopen_show_automatically", {
        p_show_id: showId,
      });
      if (error) return failed(classifyTrackingError(error).outcome);
      return { changed: data === true ? "reopened" : null };
    }

    if (verdict.kind === "complete") {
      const { data, error } = await supabase.rpc(
        "complete_show_automatically",
        {
          p_show_id: showId,
          p_episode_ids: verdict.episodeIds,
          p_allow_user_source:
            trigger.kind === "write" && trigger.newlyWatchedRegular,
        },
      );
      if (error) return failed(classifyTrackingError(error).outcome);
      return { changed: data === true ? "completed" : null };
    }

    return unchanged();
  } catch {
    // A network failure inside supabase-js, or a bug. The error is dropped:
    // its message can carry request details (spec 0007, AC-21).
    return failed("db_error");
  }
}

async function selectRow(
  supabase: SupabaseClient,
  userId: string,
  showId: number,
): Promise<{ kind: "ok"; row: CompletionRow } | { kind: "failed" }> {
  const { data, error } = await supabase
    .from("user_show_state")
    .select("status, status_source")
    .eq("user_id", userId)
    .eq("show_id", showId)
    .maybeSingle();
  if (error) return { kind: "failed" };
  return {
    kind: "ok",
    row: data ? { status: data.status, source: data.status_source } : null,
  };
}

/** One show's watched ids, or null when the read failed. */
async function readWatchedIds(
  showId: number,
): Promise<ReadonlySet<number> | null> {
  const watched = await getWatchedEpisodeIds(showIdsKey([showId]));
  if (watched.kind !== "ok") return null;
  return watched.state.get(showId) ?? new Set<number>();
}

type TmdbFailure = { kind: "failed"; outcome: TrackingOutcome };

async function readShowStatus(
  showId: number,
): Promise<{ kind: "ok"; status: TmdbShowStatus } | TmdbFailure> {
  try {
    return { kind: "ok", status: (await getTvShow(showId)).status };
  } catch (error) {
    return tmdbFailure(error);
  }
}

async function readEpisodes(
  showId: number,
): Promise<{ kind: "ok"; read: ShowEpisodes } | TmdbFailure> {
  try {
    return { kind: "ok", read: await getShowEpisodes(showId) };
  } catch (error) {
    return tmdbFailure(error);
  }
}

/**
 * A show TMDB no longer has is `not_found`; any other failure of the TMDB read
 * is `tmdb_unavailable`, including one that is not a `TmdbError` (a missing
 * token throws a plain `Error`), so the log never blames the database for it
 * (spec 0015, log registry).
 */
function tmdbFailure(error: unknown): TmdbFailure {
  return {
    kind: "failed",
    outcome:
      error instanceof TmdbError && isTmdbNotFound(error)
        ? "not_found"
        : "tmdb_unavailable",
  };
}

function unchanged(): { changed: null } {
  return { changed: null };
}

function failed(outcome: TrackingOutcome): { changed: null } {
  logTrackingEvent(TRACKING_EVENT.autoComplete, outcome);
  return { changed: null };
}

/**
 * How many shows `/upcoming` checks at once (spec 0015, AC-11): the TMDB
 * module's own cap, so a heavy user's first visit never floods TMDB.
 */
const VISIT_CHECK_CONCURRENCY = 8;

/** A row the visit check may move: set by the system, Watching or Completed. */
type SystemShow = { showId: number; status: TvStatus };

/**
 * The signed in user's shows whose status the system set and a visit may
 * move: `watching` or `completed` with `status_source = 'system'` (spec 0015,
 * API surface). Every such row, with no cap (AC-11). Request scoped, never
 * inside `use cache`: the rows belong to one person.
 */
export const getSystemShows = cache(
  async (): Promise<TrackingRead<SystemShow[]>> => {
    const user = await requireUser();

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_show_state")
        .select("show_id, status")
        .eq("user_id", user.id)
        .eq("status_source", "system")
        .in("status", ["watching", "completed"])
        .order("show_id");

      if (error) return { kind: "failed" };
      return {
        kind: "ok",
        state: data.map((row) => ({ showId: row.show_id, status: row.status })),
      };
    } catch {
      return { kind: "failed" };
    }
  },
);

/**
 * The show page's status, after the visit check (spec 0015, AC-10): the
 * stored row, and when the system set it (`watching` or `completed` with
 * source `system`), the rule run and applied first, so the pill and the
 * progress line both show the result. A row the user chose, any other
 * status, or no row makes no TMDB read (AC-14). A check that cannot decide
 * leaves the stored row as it is (AC-12).
 *
 * Every reader of this show's status on `/shows/{id}` goes through this, and
 * React `cache()` makes it one check per request.
 *
 * @param showId The show, already confirmed by `loadShow`.
 */
export const getReconciledShowStatus = cache(
  async (showId: number): Promise<TrackingRead<ShowStatusState | null>> => {
    const read = await getShowStatus(showId);
    if (read.kind !== "ok" || read.state === null) return read;

    if (!mayChange(read.state, { kind: "visit" })) return read;

    const { changed } = await applyAutoCompletion(
      showId,
      { kind: "visit" },
      read.state,
    );
    if (changed === "completed") {
      return { kind: "ok", state: { status: "completed", source: "system" } };
    }
    if (changed === "reopened") {
      return { kind: "ok", state: { status: "watching", source: "system" } };
    }
    return read;
  },
);

/**
 * Runs the visit check for every show of the user's the system set, before
 * `/upcoming` reads its Up Next list (spec 0015, AC-11), so the list, its
 * order and its empty state reflect the result: a show just completed is
 * gone, one just reopened is back, first (its `status_changed_at` is now).
 *
 * The watched ids come from one batched read for every such show. Each show
 * then settles on its own, at most `VISIT_CHECK_CONCURRENCY` at once
 * through the shared TMDB cache, so one failing show never blocks the others
 * (AC-12). A failed read of the rows skips the check and the page renders
 * what the database holds. Nothing it does is surfaced to the page.
 */
export const reconcileUpNextShows = cache(async (): Promise<void> => {
  const shows = await getSystemShows();
  if (shows.kind !== "ok") {
    logTrackingEvent(TRACKING_EVENT.autoComplete, "db_error");
    return;
  }
  if (shows.state.length === 0) return;

  // One paged read of the watched ids for every show, not one per show.
  const watched = await getWatchedEpisodeIds(
    showIdsKey(shows.state.map((show) => show.showId)),
  );
  if (watched.kind !== "ok") {
    logTrackingEvent(TRACKING_EVENT.autoComplete, "db_error");
    return;
  }
  const watchedByShow = watched.state;

  const queue = [...shows.state];
  async function worker(): Promise<void> {
    for (let show = queue.shift(); show; show = queue.shift()) {
      const row = { status: show.status, source: "system" as const };
      await applyAutoCompletion(
        show.showId,
        { kind: "visit" },
        row,
        watchedByShow.get(show.showId) ?? new Set<number>(),
      );
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(VISIT_CHECK_CONCURRENCY, queue.length) },
      worker,
    ),
  );
});
