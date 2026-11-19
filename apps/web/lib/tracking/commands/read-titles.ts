import "server-only";

import {
  EMPTY_V1_MOVIE_TITLE_STATE,
  type TitleRef,
  titleKey,
  type V1ShowTitleState,
  type V1Titles,
} from "@bestats/core/api/v1/titles";
import type { ShowEpisodes } from "@bestats/core/tmdb/types";
import { todayUtc } from "@bestats/core/tv/air-status";
import { showProgress } from "@bestats/core/tv/progress";
import { ratingsBySeason, showRating } from "@bestats/core/tv/ratings";

import { getShowEpisodesSettled } from "@/lib/tmdb";

import { logTrackingEvent, TRACKING_EVENT } from "../log";
import type { TrackingClient, TrackingDeps } from "./run";

/** Episode rows per page; a long show can have thousands of marked episodes. */
const EPISODE_PAGE_SIZE = 1000;

/**
 * The caller's own state for a batch of titles, keyed as the request named
 * them (`GET /api/v1/me/titles`, spec 0035). Every asked key is present, the
 * empty state when the user has no row, so the app never mistakes a missing
 * key for "not tracked". Every query is scoped to the verified user and runs
 * under RLS (AGENTS.md section 11).
 *
 * Show progress and ratings are derived here, per request, with core's
 * `showProgress`, `ratingsBySeason` and `showRating` over the cached TMDB
 * episode list, exactly as the web show page derives them (AGENTS.md
 * section 9). A show whose catalog read fails keeps its tracking and ratings
 * with `progress: null`, so history stays visible (AGENTS.md section 12).
 *
 * @returns The titles, or null when a database read failed.
 */
export async function readTitles(
  deps: TrackingDeps,
  refs: readonly TitleRef[],
): Promise<V1Titles | null> {
  const ids = (type: TitleRef["type"]) =>
    refs.filter((ref) => ref.type === type).map((ref) => ref.id);
  const movieIds = ids("movie");
  const showIds = ids("tv");
  const gameIds = ids("game");
  const supabase = await deps.getClient();

  const [movies, shows, games] = await Promise.all([
    movieIds.length ? readMovies(supabase, deps.userId, movieIds) : {},
    showIds.length ? readShows(supabase, deps.userId, showIds) : {},
    gameIds.length ? readGames(supabase, deps.userId, gameIds) : {},
  ]);
  if (movies === null || shows === null || games === null) return null;
  return { ...movies, ...shows, ...games };
}

async function readMovies(
  supabase: TrackingClient,
  userId: string,
  movieIds: number[],
): Promise<V1Titles | null> {
  const { data, error } = await supabase
    .from("user_movie_state")
    .select("movie_id, in_watchlist, watched_at, rating")
    .eq("user_id", userId)
    .in("movie_id", movieIds);
  if (error) {
    logTrackingEvent(TRACKING_EVENT.listRead, "db_error");
    return null;
  }

  const titles: V1Titles = {};
  for (const id of movieIds) {
    titles[titleKey("movie", id)] = EMPTY_V1_MOVIE_TITLE_STATE;
  }
  for (const row of data ?? []) {
    titles[titleKey("movie", row.movie_id)] = {
      planned: row.in_watchlist,
      watchedAt: row.watched_at,
      rating: row.rating,
    };
  }
  return titles;
}

type EpisodeRow = {
  show_id: number;
  episode_id: number;
  season_number: number;
  watched_at: string | null;
  rating: number | null;
};

async function readShows(
  supabase: TrackingClient,
  userId: string,
  showIds: number[],
): Promise<V1Titles | null> {
  const tracked = await supabase
    .from("user_show_state")
    .select("show_id")
    .eq("user_id", userId)
    .in("show_id", showIds);
  if (tracked.error) {
    logTrackingEvent(TRACKING_EVENT.showTrackingRead, "db_error");
    return null;
  }

  const rows: EpisodeRow[] = [];
  for (let offset = 0; ; offset += EPISODE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("user_episode_state")
      .select("show_id, episode_id, season_number, watched_at, rating")
      .eq("user_id", userId)
      .in("show_id", showIds)
      .order("show_id")
      .order("episode_id")
      .range(offset, offset + EPISODE_PAGE_SIZE - 1);
    if (error) {
      logTrackingEvent(TRACKING_EVENT.watchedEpisodesRead, "db_error");
      return null;
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < EPISODE_PAGE_SIZE) break;
  }

  // At most `TMDB_CONCURRENCY_LIMIT` shows are read at once. A show TMDB
  // failed for, or an outage for all of them, leaves its progress null while
  // the user's own state still shows (AGENTS.md section 12).
  let catalogs: Map<number, ShowEpisodes> = new Map();
  try {
    catalogs = (await getShowEpisodesSettled(showIds)).found;
  } catch {
    // A systemic TMDB failure: every show keeps its state with null progress.
  }

  const trackedIds = new Set((tracked.data ?? []).map((row) => row.show_id));
  const today = todayUtc(new Date());
  const titles: V1Titles = {};
  for (const id of showIds) {
    titles[titleKey("tv", id)] = showState(
      trackedIds.has(id),
      rows.filter((row) => row.show_id === id),
      catalogs.get(id) ?? null,
      today,
    );
  }
  return titles;
}

function showState(
  tracked: boolean,
  rows: EpisodeRow[],
  catalog: ShowEpisodes | null,
  today: string,
): V1ShowTitleState {
  const ratings = ratingsBySeason(
    rows.flatMap((row) =>
      row.rating === null
        ? []
        : [{ seasonNumber: row.season_number, rating: row.rating }],
    ),
  );
  const watched = new Set(
    rows.filter((row) => row.watched_at !== null).map((row) => row.episode_id),
  );

  return {
    tracked,
    // Null when the catalog read failed or TMDB no longer has the show: the
    // app reads it as "progress unavailable" (AGENTS.md section 12).
    progress: catalog ? showProgress(catalog.episodes, watched, today) : null,
    seasonRatings: [...ratings]
      .sort(([a], [b]) => a - b)
      .map(([seasonNumber, season]) => ({ seasonNumber, ...season })),
    showRating: showRating(ratings).mean,
  };
}

async function readGames(
  supabase: TrackingClient,
  userId: string,
  gameIds: number[],
): Promise<V1Titles | null> {
  const { data, error } = await supabase
    .from("user_game_state")
    .select("game_id, status, rating")
    .eq("user_id", userId)
    .in("game_id", gameIds);
  if (error) {
    logTrackingEvent(TRACKING_EVENT.gameRead, "db_error");
    return null;
  }

  const titles: V1Titles = {};
  for (const id of gameIds) {
    titles[titleKey("game", id)] = { status: null, rating: null };
  }
  for (const row of data ?? []) {
    titles[titleKey("game", row.game_id)] = {
      status: row.status,
      rating: row.rating,
    };
  }
  return titles;
}
