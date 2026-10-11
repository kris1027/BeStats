import "server-only";

import { cache } from "react";

import { getOptionalUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { getTvShowsSettled, TmdbError } from "@/lib/tmdb";
import { classifyShow, type ShowPage } from "@/lib/tv/library-page";

import { requestTodayUtc } from "./episode-state";
import { readWatchedRegular } from "./library-lists";
import { logTrackingEvent, TRACKING_EVENT } from "./log";
import { getShowRatings } from "./show-ratings";
import { getTrackedShows } from "./show-state";
import type { TrackingRead } from "./types";

/**
 * What a catalog card shows of one tracked show: the library page it sits on
 * with that page's card data, and on Watched the calculated show rating.
 * Null when the show is tracked but its page could not be worked out (its
 * TMDB details or the user's episodes failed to load): the card is then a
 * plain tracked card, never a wrong label.
 */
export type ShowCardStatus =
  | (Exclude<ShowPage, { page: "watched" }> & { rating: null })
  | (Extract<ShowPage, { page: "watched" }> & { rating: number | null });

/**
 * The signed in user's tracked shows on a grid, each with the library page it
 * sits on (prompts/catalog-card-status.md). An untracked show is absent from
 * the map; a tracked one is present, with its status or null.
 *
 * One pass per grid: the tracked set (`getTrackedShows`, shared with nothing
 * else), then for the tracked ids only the watched regular episodes, the
 * cached TMDB details and `classifyShow`, the same inputs the library pages
 * read, on the same request day, so a card cannot disagree with its page.
 * The calculated rating is read only for the shows that land on Watched.
 *
 * Request scoped and wrapped in `cache()` with a string key, so a card's
 * badge, meta line and controls share one pass. Never inside `use cache`
 * (`AGENTS.md` section 11).
 *
 * @param idsKey The grid's show ids, from `showIdsKey`.
 */
export const getShowGridStatus = cache(
  async (
    idsKey: string,
  ): Promise<TrackingRead<Map<number, ShowCardStatus | null>>> => {
    const tracked = await getTrackedShows(idsKey);
    if (tracked.kind !== "ok") return tracked;

    const ids = [...tracked.state];
    const state = new Map<number, ShowCardStatus | null>(
      ids.map((id) => [id, null]),
    );
    if (ids.length === 0) return { kind: "ok", state };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    const places = await placeShows(user.id, ids);
    if (places === null) return { kind: "ok", state };

    const watchedIds = [...places]
      .filter(([, place]) => place.page === "watched")
      .map(([id]) => id);
    const ratings =
      watchedIds.length === 0
        ? null
        : await getShowRatings(user.id, watchedIds);

    for (const [id, place] of places) {
      if (place.page !== "watched") {
        state.set(id, { ...place, rating: null });
        continue;
      }
      // A failed ratings read leaves the card plain rather than unrated.
      if (ratings?.kind !== "ok") continue;
      state.set(id, { ...place, rating: ratings.ratings.get(id) ?? null });
    }
    return { kind: "ok", state };
  },
);

/**
 * `classifyShow` for each show whose details loaded, or null when the
 * episodes or TMDB failed as a whole (logged here, with no identifiers). A
 * show whose own read failed, or that TMDB no longer has, is simply absent.
 */
async function placeShows(
  userId: string,
  ids: readonly number[],
): Promise<Map<number, ShowPage> | null> {
  const [watched, shows] = await Promise.all([
    readWatched(userId, ids),
    readShows(ids),
  ]);
  if (watched === null || shows === null) return null;

  const today = requestTodayUtc();
  const places = new Map<number, ShowPage>();
  for (const [id, show] of shows.found) {
    places.set(id, classifyShow(show, watched.get(id) ?? new Set(), today));
  }
  return places;
}

async function readWatched(userId: string, ids: readonly number[]) {
  try {
    const supabase = await createClient();
    const watched = await readWatchedRegular(supabase, userId, ids);
    if (watched === null)
      logTrackingEvent(TRACKING_EVENT.watchedEpisodesRead, "db_error");
    return watched;
  } catch {
    // A network failure inside supabase-js. The error is dropped: its
    // message can carry request details.
    logTrackingEvent(TRACKING_EVENT.watchedEpisodesRead, "db_error");
    return null;
  }
}

async function readShows(ids: readonly number[]) {
  try {
    return await getTvShowsSettled(ids);
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    logTrackingEvent(TRACKING_EVENT.showTrackingRead, "tmdb_unavailable");
    return null;
  }
}
