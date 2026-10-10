import "server-only";

import type { LibraryList } from "@/lib/catalog/library-list";
import {
  classifyMovie,
  type MoviePage,
  upcomingReleaseDate,
} from "@/lib/catalog/movie-page";
import { createClient } from "@/lib/supabase/server";
import {
  getMovieSummaries,
  getMoviesSettled,
  getTvShowsSettled,
  type MovieSummary,
  type SettledBatch,
  TmdbError,
} from "@/lib/tmdb";
import {
  classifyShow,
  type EpisodeKey,
  episodeKey,
  type ShowPage,
} from "@/lib/tv/library-page";

import { logTrackingEvent, TRACKING_EVENT } from "./log";

/**
 * The reads behind `/watchlist`, `/upcoming` and `/watched` (spec 0020, API
 * surface). Each tab lists one media type, the page's navbar tab (feature
 * 22), with its own count and pages.
 *
 * A show or a planned movie is on one page, and which one is worked out on
 * every request (AC-7, AC-13): Postgres supplies the user's titles and
 * episodes, the cached TMDB reads supply each title's air dates, and the pure
 * classifiers place them. Nothing derived is stored, so nothing goes stale.
 * Every tab classifies on its own request, from the same ceiling, so the
 * three tabs of a media type always partition the same titles (AC-8, AC-16).
 *
 * None of these may ever run inside `use cache`: the rows belong to one
 * person (`AGENTS.md` section 11, AC-22). Each filters on `user_id`
 * explicitly as well as through row level security, the spec 0007 pattern,
 * and every order ends in the TMDB id, so two titles stamped in the same
 * instant never swap places between pages.
 */

/** Cards per page on every library tab (AC-16). */
export const LIBRARY_PAGE_SIZE = 20;

/**
 * How many titles one request classifies per media type (AC-16). Each is a
 * TMDB read, cached but cold for a new heavy user, so the most recently
 * active are checked and every tab says so when there are more. The ceiling
 * is taken in SQL, before any TMDB read, in one order every tab of the media
 * type inherits.
 */
export const LIBRARY_CLASSIFY_LIMIT = 500;

/**
 * The last page of a list of `total` cards: at least 1, so an empty list
 * still has a page to show its empty state on.
 */
export function libraryLastPage(total: number): number {
  return Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
}

/** One page of a list, or a failed read. Never an empty list on failure. */
export type LibraryPage<Row> =
  | { kind: "ok"; rows: Row[]; total: number }
  | { kind: "failed" };

/**
 * One page of a classified tab (AC-16, AC-17), or why there is none: a
 * failed Postgres read, or a systemic TMDB failure, which each show their own
 * panel and never an empty list.
 *
 * `total` counts every card on the tab, across pages. `failedCount` is the
 * titles whose own TMDB read failed, which are on no page and named in a
 * note on every tab of the media type; `capped` says the ceiling left older
 * titles unchecked.
 */
export type LibraryTab<Card> =
  | {
      kind: "ok";
      cards: Card[];
      total: number;
      failedCount: number;
      capped: boolean;
    }
  | { kind: "failed" }
  | { kind: "tmdb_failed" };

/** What a card shows of a TMDB title. */
export type LibraryTitle = {
  name: string;
  posterUrl: string | null;
  tmdbRating: number | null;
};

/** The show tabs (AC-8). */
export type ShowTab = LibraryList;

/**
 * What one tab read is asked for (AC-16). The four always travel together
 * from the page to the reader.
 */
export type LibraryTabQuery<Tab extends LibraryList> = {
  /** The verified session's user, never a client value. */
  userId: string;
  tab: Tab;
  /** A page already parsed by `parsePageParam`. */
  page: number;
  /** `requestTodayUtc()`, read once per request (AC-22). */
  today: string;
};

/**
 * One show card: the page `classifyShow` gave it, with the title. A show
 * TMDB no longer has is `missing`, and only ever on the Watchlist tab, at its
 * end (AC-17).
 */
export type ShowTabCard =
  | (ShowPage & { showId: number; title: LibraryTitle })
  | { page: "missing"; showId: number };

/** The movie tabs that need classifying; Watched movies need none (AC-16). */
export type MovieTab = Exclude<MoviePage, "watched">;

/** One movie card on Watchlist or Upcoming, or one TMDB no longer has. */
export type MovieTabCard =
  | { page: "watchlist"; movieId: number; title: LibraryTitle }
  | {
      page: "upcoming";
      movieId: number;
      title: LibraryTitle;
      releaseDate: string | null;
    }
  | { page: "missing"; movieId: number };

/** Rows asked for per request; the API caps responses at `max_rows` (1000). */
const EPISODE_PAGE_SIZE = 1000;

/**
 * PostgREST's answer to an offset past the last row when an exact count is
 * asked for: a 416 rather than an empty page. A page past the end is a normal
 * case (a stale link, or the last card on a page just removed), and the page
 * needs the total to redirect to the last page, so it is read again as a
 * count alone.
 */
const RANGE_NOT_SATISFIABLE = "PGRST103";

/** The 0 based slice of a 1 based page. */
function pageSlice<T>(items: readonly T[], page: number): T[] {
  const from = (page - 1) * LIBRARY_PAGE_SIZE;
  return items.slice(from, from + LIBRARY_PAGE_SIZE);
}

/**
 * The capped rows a tab classifies: at most `LIBRARY_CLASSIFY_LIMIT`, and
 * whether the query's one extra row said there were more (AC-16).
 */
function capRows<Row>(all: readonly Row[]): { rows: Row[]; capped: boolean } {
  return {
    rows: all.slice(0, LIBRARY_CLASSIFY_LIMIT),
    capped: all.length > LIBRARY_CLASSIFY_LIMIT,
  };
}

/**
 * A settled TMDB batch read, or null after a systemic failure (a rejected
 * credential or an exhausted rate limit), logged once here so every library
 * read reports it the same way (AC-17). Anything that is not a `TmdbError`
 * is a bug and still throws.
 */
async function settledTmdbRead<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    logTrackingEvent(TRACKING_EVENT.listRead, "tmdb_unavailable");
    return null;
  }
}

/**
 * The part every classified tab shares (AC-8, AC-16, AC-17): read the
 * capped titles' TMDB details, keep the ones `place` puts on this tab, order
 * them, add a "No longer on TMDB" card for each missing title on Watchlist
 * only, and slice the page. Titles whose own read failed are on no page and
 * only counted.
 */
async function classifyTab<Row extends { id: number }, Title, Placed, Card>({
  query,
  rows,
  capped,
  read,
  place,
  order,
  card,
  missing,
}: {
  query: LibraryTabQuery<LibraryList>;
  rows: readonly Row[];
  capped: boolean;
  read: (ids: readonly number[]) => Promise<SettledBatch<Title>>;
  place: (row: Row, title: Title) => Placed | null;
  order?: (a: Placed, b: Placed) => number;
  card: (placed: Placed) => Card;
  missing: (id: number) => Card;
}): Promise<LibraryTab<Card>> {
  if (rows.length === 0) {
    return { kind: "ok", cards: [], total: 0, failedCount: 0, capped };
  }

  const titles = await settledTmdbRead(() => read(rows.map((row) => row.id)));
  if (titles === null) return { kind: "tmdb_failed" };

  const placed: Placed[] = [];
  const gone: Card[] = [];
  for (const row of rows) {
    const title = titles.found.get(row.id);
    if (title === undefined) {
      if (query.tab === "watchlist" && titles.missingIds.includes(row.id)) {
        gone.push(missing(row.id));
      }
      continue;
    }
    const item = place(row, title);
    if (item !== null) placed.push(item);
  }
  if (order !== undefined) placed.sort(order);

  const cards = [...placed.map(card), ...gone];
  return {
    kind: "ok",
    cards: pageSlice(cards, query.page),
    total: cards.length,
    failedCount: titles.failedIds.length,
    capped,
  };
}

/** One tracked show, as `user_tracked_shows` gives it. */
type TrackedShowRow = {
  id: number;
  trackedAt: string;
  lastWatchedAt: string | null;
};

/** A show placed on the tab, with the row its order reads. */
type PlacedShow = {
  row: TrackedShowRow;
  card: ShowTabCard;
};

/**
 * One page of a show tab: Watchlist, Upcoming or Watched (AC-7 to AC-12,
 * AC-16, AC-17).
 *
 * The user's tracked shows, at most `LIBRARY_CLASSIFY_LIMIT`,
 * most recently active first (AC-16), then their watched regular episodes,
 * then each show's cached details read, then `classifyShow` for each. The
 * tab keeps its own shows in its own order:
 *
 * - Watchlist: the view's order, last activity newest first (AC-9), with any
 *   show TMDB no longer has at the end (AC-17).
 * - Upcoming: dated shows soonest first, Date TBA last, then `tracked_at`
 *   newest first (AC-11).
 * - Watched: the newest watched episode of any season, else `tracked_at`,
 *   newest first (AC-12).
 *
 * Every order ends in `show_id`.
 */
export async function getShowLibraryTab(
  query: LibraryTabQuery<ShowTab>,
): Promise<LibraryTab<ShowTabCard>> {
  const { userId, tab, today } = query;
  let rows: TrackedShowRow[];
  let capped: boolean;
  let watched: Map<number, Set<EpisodeKey>>;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_tracked_shows")
      .select("show_id, tracked_at, last_watched_at")
      .eq("user_id", userId)
      .order("last_activity_at", { ascending: false })
      .order("show_id", { ascending: true })
      .limit(LIBRARY_CLASSIFY_LIMIT + 1);
    if (error) return failed();

    // A view's columns are all nullable to the type generator; the view
    // itself never yields a null id or `tracked_at`.
    ({ rows, capped } = capRows(
      data.flatMap((row) =>
        row.show_id === null || row.tracked_at === null
          ? []
          : [
              {
                id: row.show_id,
                trackedAt: row.tracked_at,
                lastWatchedAt: row.last_watched_at,
              },
            ],
      ),
    ));
    if (rows.length === 0) {
      return { kind: "ok", cards: [], total: 0, failedCount: 0, capped };
    }

    const read = await readWatchedRegular(
      supabase,
      userId,
      rows.map((row) => row.id),
    );
    if (read === null) return failed();
    watched = read;
  } catch {
    // A network failure inside supabase-js. The error is dropped on purpose,
    // as in the actions: its message can carry request details.
    return failed();
  }

  return classifyTab({
    query,
    rows,
    capped,
    read: getTvShowsSettled,
    place: (row, show): PlacedShow | null => {
      const result = classifyShow(
        show,
        watched.get(row.id) ?? new Set(),
        today,
      );
      if (result.page !== tab) return null;
      const title = {
        name: show.name,
        posterUrl: show.posterUrl,
        tmdbRating: show.tmdbRating,
      };
      return { row, card: { ...result, showId: row.id, title } };
    },
    order:
      tab === "upcoming"
        ? upcomingShowOrder
        : tab === "watched"
          ? watchedShowOrder
          : undefined,
    card: (placed) => placed.card,
    missing: (showId) => ({ page: "missing", showId }),
  });
}

/** Dated first, soonest first; then `tracked_at` newest first; then the id. */
function upcomingShowOrder(a: PlacedShow, b: PlacedShow): number {
  const dateA = a.card.page === "upcoming" ? a.card.airDate : null;
  const dateB = b.card.page === "upcoming" ? b.card.airDate : null;
  return (
    compareDates(dateA, dateB) ||
    compareDesc(a.row.trackedAt, b.row.trackedAt) ||
    a.row.id - b.row.id
  );
}

/** The newest watched episode, else `tracked_at`, newest first; then the id. */
function watchedShowOrder(a: PlacedShow, b: PlacedShow): number {
  return (
    compareDesc(
      a.row.lastWatchedAt ?? a.row.trackedAt,
      b.row.lastWatchedAt ?? b.row.trackedAt,
    ) || a.row.id - b.row.id
  );
}

/**
 * Two `YYYY-MM-DD` dates, soonest first, with no date last. Both come from
 * values the classifiers already checked, so the string order is the date
 * order.
 */
function compareDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Two instants as PostgREST writes them, newest first. */
function compareDesc(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}

/**
 * The user's watched regular episodes of the given shows, as `episodeKey`s
 * per show (AC-7; specials never count), or null on a failed read.
 *
 * Paged by the primary key until the exact count is reached, as
 * `getWatchedEpisodeIds` does, so a long history never loses rows to the
 * response cap. The pages are read one at a time, also as that read does:
 * every library tab runs this on each request, so a long history must not
 * open a connection per thousand episodes at once.
 */
async function readWatchedRegular(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  showIds: readonly number[],
): Promise<Map<number, Set<EpisodeKey>> | null> {
  const query = (offset: number) =>
    supabase
      .from("user_episode_state")
      .select("show_id, season_number, episode_number", { count: "exact" })
      .eq("user_id", userId)
      .in("show_id", showIds)
      .gte("season_number", 1)
      .not("watched_at", "is", null)
      .order("episode_id")
      .range(offset, offset + EPISODE_PAGE_SIZE - 1);

  const watched = new Map<number, Set<EpisodeKey>>();
  for (let offset = 0; ; offset += EPISODE_PAGE_SIZE) {
    const page = await query(offset);
    if (page.error || page.count === null) return null;

    for (const row of page.data) {
      let set = watched.get(row.show_id);
      if (set === undefined) {
        set = new Set();
        watched.set(row.show_id, set);
      }
      set.add(episodeKey(row.season_number, row.episode_number));
    }
    // An empty page ends the loop even if rows were deleted mid read.
    if (page.data.length === 0 || offset + EPISODE_PAGE_SIZE >= page.count) {
      return watched;
    }
  }
}

/** One planned movie not yet watched, as `user_movie_state` holds it. */
type PlannedMovieRow = { id: number };

/**
 * One page of a movie tab: Watchlist or Upcoming (AC-13, AC-16, AC-17).
 *
 * The user's planned movies not yet watched, at most
 * `LIBRARY_CLASSIFY_LIMIT`, newest plan first, then each movie's cached
 * details read and `classifyMovie`. Watchlist keeps the plan order, with any
 * movie TMDB no longer has at the end; Upcoming goes soonest release first,
 * Date TBA last, then the plan order. Every order ends in `movie_id`.
 */
export async function getMovieLibraryTab(
  query: LibraryTabQuery<MovieTab>,
): Promise<LibraryTab<MovieTabCard>> {
  const { userId, tab, today } = query;
  let rows: PlannedMovieRow[];
  let capped: boolean;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_movie_state")
      .select("movie_id, watchlisted_at")
      .eq("user_id", userId)
      .eq("in_watchlist", true)
      .is("watched_at", null)
      .order("watchlisted_at", { ascending: false })
      .order("movie_id", { ascending: true })
      .limit(LIBRARY_CLASSIFY_LIMIT + 1);
    if (error) return failed();

    // A planned row always has a plan time (a check constraint).
    ({ rows, capped } = capRows(
      data.flatMap((row) =>
        row.watchlisted_at === null ? [] : [{ id: row.movie_id }],
      ),
    ));
  } catch {
    return failed();
  }

  // The rows are already in plan order, so a stable sort on the date alone
  // keeps that order, and the id after it, within a day (AC-13).
  return classifyTab({
    query,
    rows,
    capped,
    read: getMoviesSettled,
    place: (row, movie): MovieTabCard | null => {
      const result = classifyMovie(
        { releaseDate: movie.releaseDate, inWatchlist: true, watchedAt: null },
        today,
      );
      if (result !== tab) return null;
      const title = {
        name: movie.title,
        posterUrl: movie.posterUrl,
        tmdbRating: movie.tmdbRating,
      };
      return result === "watchlist"
        ? { page: "watchlist", movieId: row.id, title }
        : {
            page: "upcoming",
            movieId: row.id,
            title,
            releaseDate: upcomingReleaseDate(movie.releaseDate, today),
          };
    },
    order:
      tab === "upcoming"
        ? (a, b) =>
            compareDates(
              a.page === "upcoming" ? a.releaseDate : null,
              b.page === "upcoming" ? b.releaseDate : null,
            )
        : undefined,
    card: (placed) => placed,
    missing: (movieId) => ({ page: "missing", movieId }),
  });
}

/** One watched movie: its score, and its exact watched time for Undo. */
export type WatchedMovieRow = {
  tmdbId: number;
  /** `watched_at` as PostgREST returned it, so Undo puts back the instant. */
  watchedAt: string;
  rating: number | null;
};

/**
 * One page of the user's watched movies, most recent first (spec 0008, AC-2;
 * spec 0020, AC-16: this tab needs no classification and has no ceiling).
 *
 * One ordered query on `user_movie_state` with an exact count, served by its
 * watched index: `watched_at` descending, then the movie id. A watched movie
 * is here whatever its plan says (AC-13).
 *
 * @param userId The verified session's user, never a client value.
 * @param page A page already parsed by `parsePageParam`.
 */
export async function getWatchedMoviesPage(
  userId: string,
  page: number,
): Promise<LibraryPage<WatchedMovieRow>> {
  try {
    const supabase = await createClient();
    const from = (page - 1) * LIBRARY_PAGE_SIZE;
    const { data, error, count } = await supabase
      .from("user_movie_state")
      .select("movie_id, watched_at, rating", { count: "exact" })
      .eq("user_id", userId)
      .not("watched_at", "is", null)
      .order("watched_at", { ascending: false })
      .order("movie_id", { ascending: true })
      .range(from, from + LIBRARY_PAGE_SIZE - 1);

    if (error?.code === RANGE_NOT_SATISFIABLE) {
      const head = await supabase
        .from("user_movie_state")
        .select("movie_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("watched_at", "is", null);
      if (head.error || head.count === null) return failed();
      return { kind: "ok", rows: [], total: head.count };
    }
    if (error || count === null) return failed();

    return {
      kind: "ok",
      total: count,
      rows: data.flatMap((row) =>
        row.watched_at === null
          ? []
          : [
              {
                tmdbId: row.movie_id,
                watchedAt: row.watched_at,
                rating: row.rating,
              },
            ],
      ),
    };
  } catch {
    return failed();
  }
}

/** A page's movie titles, keyed by TMDB id, or a systemic TMDB failure. */
export type LibraryMovieTitles =
  | { kind: "ok"; movies: Map<number, MovieSummary> }
  | { kind: "failed" };

/**
 * The TMDB titles for one page of watched movies, through the cached per
 * title reads (spec 0008, AC-11). A title TMDB no longer has is simply absent
 * from the map, so the page shows its "No longer on TMDB" card. A systemic
 * failure is `failed` rather than a short map, which would render every
 * title as missing and invite the user to remove rows that are fine.
 *
 * @param movieIds At most `LIBRARY_PAGE_SIZE` ids.
 */
export async function getLibraryMovieTitles(
  movieIds: readonly number[],
): Promise<LibraryMovieTitles> {
  if (movieIds.length === 0) return { kind: "ok", movies: new Map() };
  const read = await settledTmdbRead(() => getMovieSummaries(movieIds));
  if (read === null) return { kind: "failed" };
  return {
    kind: "ok",
    movies: new Map(read.found.map((movie) => [movie.id, movie])),
  };
}

function failed(): { kind: "failed" } {
  logTrackingEvent(TRACKING_EVENT.listRead, "db_error");
  return { kind: "failed" };
}
