import type { ShowStatusState } from "@/lib/tracking/types";

import {
  eligibleEpisodes,
  type ProgressEpisode,
  showProgress,
} from "./progress";

/**
 * The most ids `complete_show_automatically` accepts in one call (spec 0015,
 * API surface). A longer show never completes automatically: the verdict
 * answers `none`, so the database never has to refuse it.
 */
export const MAX_COMPLETION_EPISODE_IDS = 20_000;

/**
 * The two TMDB show statuses that mean no new episode is coming (spec 0015,
 * AC-1). Everything else, the empty string included, is ongoing.
 */
const FINISHED_SHOW_STATUSES: ReadonlySet<string> = new Set([
  "Ended",
  "Canceled",
]);

/**
 * Whether TMDB says the show has ended or been canceled (spec 0015, AC-1).
 * Exact match on TMDB's own wording: `Returning Series`, `In Production`,
 * `Planned`, `Pilot` and a missing status all read as ongoing, so an unknown
 * value can never complete a show (`AGENTS.md` section 9).
 *
 * @param status `TvShow.status` or `ShowEpisodes.showStatus`.
 */
export function isFinishedShowStatus(status: string): boolean {
  return FINISHED_SHOW_STATUSES.has(status);
}

/**
 * The parts of a `getShowEpisodes` read the rule needs, or `null` when the
 * read failed (a `TmdbError`, or a show TMDB no longer has). Structural, so
 * this module stays pure and free of the TMDB module.
 */
export type CompletionRead = {
  episodes: readonly ProgressEpisode[];
  complete: boolean;
  showStatus: string;
} | null;

/** The stored row: status and source, or `null` when there is no row. */
export type CompletionRow = ShowStatusState | null;

/**
 * What ran the check (spec 0015, AC-2). `write` is a Server Action right
 * after your own episode write; `newlyWatchedRegular` is whether that write
 * moved a regular episode from unwatched to watched. `visit` is the show page
 * or `/upcoming` rendering.
 */
export type CompletionTrigger =
  | { kind: "write"; newlyWatchedRegular: boolean }
  | { kind: "visit" };

/** What to do with the row. `episodeIds` goes to `complete_show_automatically`. */
export type CompletionVerdict =
  | { kind: "complete"; episodeIds: number[] }
  | { kind: "reopen" }
  | { kind: "none" };

const NONE: CompletionVerdict = { kind: "none" };

/**
 * The automatic completion rule, the one place it exists (spec 0015, AC-1,
 * AC-2, the `completionVerdict` table).
 *
 * A show is finished and watched only when the read is whole, TMDB says
 * `Ended` or `Canceled`, and progress is `counted` with nothing left: a
 * `none_aired` show is never finished. An incomplete or failed read answers
 * `none` in both directions, so a partial fetch neither completes nor reopens
 * (`AGENTS.md` section 9). Only rows the system set move on a visit; a
 * Watching you chose completes only through your own finishing write, and a
 * reopen after an unmark is the database trigger's job, not a write's.
 *
 * @param read The TMDB episode read, or null when it failed.
 * @param row The stored status and source.
 * @param trigger What ran the check.
 * @param watchedIds The user's watched episode ids for this show.
 * @param today `requestTodayUtc()`, read once per request.
 */
export function completionVerdict(
  read: CompletionRead,
  row: CompletionRow,
  trigger: CompletionTrigger,
  watchedIds: ReadonlySet<number>,
  today: string,
): CompletionVerdict {
  if (row === null || read === null || !read.complete) return NONE;

  const progress = showProgress(read.episodes, watchedIds, today);
  const finished =
    isFinishedShowStatus(read.showStatus) &&
    progress.kind === "counted" &&
    progress.next === null;

  if (row.status === "watching") {
    const mayComplete =
      row.source === "system" ||
      (trigger.kind === "write" && trigger.newlyWatchedRegular);
    if (!mayComplete || !finished) return NONE;

    const episodeIds = [
      ...new Set(eligibleEpisodes(read.episodes, today).map((e) => e.id)),
    ];
    if (episodeIds.length > MAX_COMPLETION_EPISODE_IDS) return NONE;
    return { kind: "complete", episodeIds };
  }

  if (
    row.status === "completed" &&
    row.source === "system" &&
    trigger.kind === "visit" &&
    !finished
  ) {
    return { kind: "reopen" };
  }

  return NONE;
}
