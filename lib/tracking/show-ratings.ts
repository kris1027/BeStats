import "server-only";

import { cache } from "react";

import { getOptionalUser } from "@/lib/auth/user";
import { publicEnvProblems } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  ratingsBySeason,
  type SeasonEpisodeRating,
  showRating,
} from "@/lib/tv/ratings";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import type { TrackingRead } from "./types";

/**
 * Rows asked for per request. The API caps every response at `max_rows`
 * (1000 in `supabase/config.toml`) and truncates past it without an error, so
 * a long running show read in one request would lose ratings silently.
 */
export const SHOW_RATINGS_PAGE_SIZE = 1000;

/**
 * The signed in user's rated episodes for one show, in one query for the
 * whole show page (spec 0012, AC-9).
 *
 * The heading and every season card ask with the same primitive, so React
 * `cache()` gives them one read per request. Rows are placed by the season
 * number stored when they were written, without asking TMDB which episodes it
 * still lists: that would cost a request per season on every show page. An
 * episode TMDB later removes or renumbers keeps counting under its old season
 * (spec 0012, Consequences).
 *
 * Reads in keyset pages ordered by the episode id (`readKeysetPages`), so a
 * show with more rated episodes than one response holds (One Piece, a daily
 * soap) still averages every rating.
 *
 * Never called inside `use cache`: the result belongs to one person
 * (`AGENTS.md` section 11, AC-13).
 *
 * @param showId The show, already confirmed by `loadShow`.
 */
export const getShowEpisodeRatings = cache(
  async (showId: number): Promise<TrackingRead<SeasonEpisodeRating[]>> => {
    if (publicEnvProblems()) return { kind: "signed_out" };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    const supabase = await createClient();
    const rows = await readKeysetPages((after: EpisodeRatingRow | null) => {
      let query = supabase
        .from("user_episode_state")
        .select("episode_id, season_number, rating", { count: "exact" })
        .eq("user_id", user.id)
        .eq("show_id", showId)
        .not("rating", "is", null);
      if (after) query = query.gt("episode_id", after.episode_id);
      return query.order("episode_id").range(0, SHOW_RATINGS_PAGE_SIZE - 1);
    });
    if (rows === null) {
      logTrackingEvent(TRACKING_EVENT.showRatingRead, "db_error");
      return { kind: "failed" };
    }

    const state: SeasonEpisodeRating[] = [];
    for (const row of rows) {
      if (row.rating !== null) {
        state.push({ seasonNumber: row.season_number, rating: row.rating });
      }
    }
    return { kind: "ok", state };
  },
);

/**
 * Each listed show's calculated rating: the equal weight mean of its rated
 * regular seasons, unrounded, or null when none is rated (spec 0019, AC-5;
 * `AGENTS.md` section 9). The rule itself lives once, in `lib/tv/ratings.ts`.
 *
 * The `/watched` page's counterpart of `getShowEpisodeRatings`: one query for
 * the whole page rather than one per card, paged the same way, with the
 * cursor on `(show_id, episode_id)` because the rows span several shows. Not
 * wrapped in `cache()`: one page asks once.
 *
 * A failed read is `failed`, never a short map: a show missing from the map
 * would render with no badge, a false "not rated" (AC-10).
 *
 * @param userId The verified session's user, never a client value.
 * @param showIds The page's show ids, at most `LIBRARY_PAGE_SIZE`.
 */
export async function getShowRatings(
  userId: string,
  showIds: readonly number[],
): Promise<
  { kind: "ok"; ratings: Map<number, number | null> } | { kind: "failed" }
> {
  if (showIds.length === 0) return { kind: "ok", ratings: new Map() };

  let rows: ShowEpisodeRatingRow[] | null;
  try {
    const supabase = await createClient();
    rows = await readKeysetPages((after: ShowEpisodeRatingRow | null) => {
      let query = supabase
        .from("user_episode_state")
        .select("show_id, episode_id, season_number, rating", {
          count: "exact",
        })
        .eq("user_id", userId)
        .in("show_id", [...showIds])
        .not("rating", "is", null);
      if (after) {
        query = query.or(
          `show_id.gt.${after.show_id},and(show_id.eq.${after.show_id},episode_id.gt.${after.episode_id})`,
        );
      }
      return query
        .order("show_id")
        .order("episode_id")
        .range(0, SHOW_RATINGS_PAGE_SIZE - 1);
    });
  } catch {
    // A network failure inside supabase-js. The error is dropped on purpose:
    // its message can carry request details (spec 0008, AC-19).
    rows = null;
  }
  if (rows === null) {
    logTrackingEvent(TRACKING_EVENT.showRatingRead, "db_error");
    return { kind: "failed" };
  }

  const byShow = new Map<number, SeasonEpisodeRating[]>(
    showIds.map((id) => [id, []]),
  );
  for (const row of rows) {
    if (row.rating === null) continue;
    byShow
      .get(row.show_id)
      ?.push({ seasonNumber: row.season_number, rating: row.rating });
  }
  const ratings = new Map<number, number | null>();
  for (const [showId, showRows] of byShow) {
    ratings.set(showId, showRating(ratingsBySeason(showRows)).mean);
  }
  return { kind: "ok", ratings };
}

/** One rated episode row as the show page reads it. */
type EpisodeRatingRow = {
  episode_id: number;
  season_number: number;
  rating: number | null;
};

/** One rated episode row as the watched page reads it, across shows. */
type ShowEpisodeRatingRow = EpisodeRatingRow & { show_id: number };

/**
 * Every row of a query read in keyset pages, or null when any page failed.
 *
 * `readPage` asks for the rows after the last one read (`null` for the
 * first page), never an offset: a rating cleared or added mid read would
 * shift an offset, skipping or repeating another row. With an exact count,
 * `count` is what remains past the cursor, so a page holding all of it is the
 * last, and a server cap below the page size skips nothing. An empty page
 * ends the read whatever the count says. A failed page fails the whole read,
 * because a partial read would average the wrong ratings.
 */
async function readKeysetPages<Row>(
  readPage: (after: Row | null) => PromiseLike<{
    data: Row[] | null;
    count: number | null;
    error: unknown;
  }>,
): Promise<Row[] | null> {
  const rows: Row[] = [];
  let after: Row | null = null;
  for (;;) {
    const { data, count, error } = await readPage(after);
    if (error || data === null || count === null) return null;
    rows.push(...data);
    const last = data.at(-1);
    if (last === undefined || data.length >= count) return rows;
    after = last;
  }
}
