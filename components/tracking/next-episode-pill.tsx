import { GlassPill } from "@/components/glass-pill";
import { getShowEpisodes, TmdbError } from "@/lib/tmdb";
import { requestTodayUtc } from "@/lib/tracking/episode-state";
import { NEXT_EPISODE_MESSAGES } from "@/lib/tracking/messages";
import { getWatchedEpisodeIds } from "@/lib/tracking/show-state";
import { showProgress } from "@/lib/tv/progress";

import { NextEpisodeIcon } from "./tracking-icons";

/**
 * The Next episode pill on a watchlist show card (spec 0013, AC-15).
 *
 * `S{season}E{episode}` of the first aired regular episode not watched, or
 * "Up to date" once every aired one is. Nothing at all when nothing has aired,
 * when the episode read is incomplete or fails (a partial read could name an
 * episode the user already watched), or while it loads: the grid renders each
 * pill in its own Suspense boundary with a `null` fallback, so posters and
 * titles never wait on any show's episodes.
 *
 * Every pill on the page passes the same `watchedIdsKey`, so the watched ids
 * are one query for the whole page. The TMDB read is the public `hours`
 * cache; the watched ids and today are read per request (AC-12).
 *
 * @param showId The card's show.
 * @param watchedIdsKey Every show id on the page, from `showIdsKey`.
 */
async function NextEpisodePill({
  showId,
  watchedIdsKey,
}: {
  showId: number;
  watchedIdsKey: string;
}) {
  const watched = await getWatchedEpisodeIds(watchedIdsKey);
  if (watched.kind !== "ok") return null;

  let episodes: Awaited<ReturnType<typeof getShowEpisodes>>;
  try {
    episodes = await getShowEpisodes(showId);
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return null;
  }
  if (!episodes.complete) return null;

  const progress = showProgress(
    episodes.episodes,
    watched.state.get(showId) ?? new Set(),
    requestTodayUtc(),
  );
  if (progress.kind === "none_aired") return null;

  const { next } = progress;
  if (next === null) {
    return (
      <GlassPill
        data-slot="next-episode"
        icon={<NextEpisodeIcon />}
        className="h-9 px-3 backdrop-blur-glass"
      >
        {NEXT_EPISODE_MESSAGES.upToDate}
      </GlassPill>
    );
  }

  return (
    <GlassPill
      data-slot="next-episode"
      icon={<NextEpisodeIcon />}
      className="h-9 px-3"
    >
      <span className="sr-only">
        {NEXT_EPISODE_MESSAGES.accessible(
          next.seasonNumber,
          next.episodeNumber,
        )}
      </span>
      <span aria-hidden="true">
        {NEXT_EPISODE_MESSAGES.pill(next.seasonNumber, next.episodeNumber)}
      </span>
    </GlassPill>
  );
}

export { NextEpisodePill };
