import { RetryLink } from "@/components/retry-link";
import { getShowEpisodes, type ShowEpisodes, TmdbError } from "@/lib/tmdb";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { SHOW_PROGRESS_MESSAGES } from "@/lib/tracking/messages";
import {
  getShowStatus,
  getWatchedEpisodeIds,
  showIdsKey,
} from "@/lib/tracking/show-state";
import { type ShowProgress, showProgress } from "@/lib/tv/progress";

/**
 * The progress line under the show hero's status pill (spec 0013, AC-10 to
 * AC-12).
 *
 * It appears once the show matters to the user: a status row, or at least one
 * watched episode among the regular episodes TMDB lists (a watched special
 * alone does not count). Then it says "{watched} of {total} episodes
 * watched" with a bar, or "No episodes have aired yet". When the episode read
 * is incomplete or fails it says "Progress unavailable right now" with Try
 * again, and never a number: a partial read would undercount (`AGENTS.md`
 * section 9).
 *
 * The TMDB episode list comes from its public `hours` cache; the watched ids
 * and today are read per request, outside any cache (AC-12). The page renders
 * this in its own Suspense boundary with a `null` fallback, so nothing
 * shifts while it loads and the status pill never waits for it.
 *
 * @param showId The show, already confirmed by `loadShow`.
 */
async function ShowProgressSlot({ showId }: { showId: number }) {
  const [status, watched] = await Promise.all([
    getShowStatus(showId),
    getWatchedEpisodeIds(showIdsKey([showId])),
  ]);
  if (status.kind === "signed_out" || watched.kind === "signed_out") {
    return null;
  }
  const retry = `/shows/${showId}`;
  // A failed status read cannot tell whether the show is tracked, so it gets
  // the same Try again as a failed watched read rather than no line at all.
  if (watched.kind === "failed" || status.kind === "failed") {
    return <Unavailable retryHref={retry} />;
  }

  const watchedIds = watched.state.get(showId) ?? new Set<number>();
  const hasRow = status.state !== null;
  // Nothing tracked and nothing watched: no line, and no TMDB read for it.
  if (!hasRow && watchedIds.size === 0) return null;

  let read: ShowEpisodes;
  try {
    read = await getShowEpisodes(showId);
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return <Unavailable retryHref={retry} />;
  }

  const listed = new Set(read.episodes.map((episode) => episode.id));
  const watchedRegular = [...watchedIds].some((id) => listed.has(id));
  if (read.complete) {
    if (!hasRow && !watchedRegular) return null;
    return (
      <ProgressLine
        progress={showProgress(read.episodes, watchedIds, requestTodayUtc())}
      />
    );
  }
  // A partial read cannot say whether a watched id belongs to a missing
  // season, so any watched id keeps the line, and it shows no number.
  return <Unavailable retryHref={retry} />;
}

function ProgressLine({ progress }: { progress: ShowProgress }) {
  if (progress.kind === "none_aired") {
    return (
      <p data-slot="show-progress" className="text-sm text-text-secondary">
        {SHOW_PROGRESS_MESSAGES.noneAired}
      </p>
    );
  }

  const { watched, total } = progress;
  return (
    <div data-slot="show-progress" className="flex flex-col gap-2">
      <p className="text-sm text-text-secondary">
        {SHOW_PROGRESS_MESSAGES.counted(watched, total)}
      </p>
      <div
        role="progressbar"
        aria-label={SHOW_PROGRESS_MESSAGES.barLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={watched}
        className="h-1 w-full max-w-80 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-status-planned"
          style={{ width: `${(watched / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Unavailable({ retryHref }: { retryHref: string }) {
  return (
    <div
      data-slot="show-progress-unavailable"
      className="flex flex-wrap items-center gap-3"
    >
      <p className="text-sm text-text-secondary">
        {SHOW_PROGRESS_MESSAGES.unavailable}
      </p>
      <RetryLink href={retryHref} className="md:h-9" />
    </div>
  );
}

export { ShowProgressSlot };
