import type { MediaType } from "@/lib/catalog/media-type";

import type {
  EpisodeTrackingError,
  MovieTrackingError,
  ShowTrackingError,
} from "./types";

/**
 * Every toast a tracking control can show, written once (spec 0007, toast
 * copy).
 *
 * Toasts appear only on failure; a success is shown by the control itself. An
 * invalid input shares the generic copy because it can only come from a bug or
 * a tampered call, and telling the person which field was wrong would not help
 * them.
 */
export const TRACKING_MESSAGES: Record<MovieTrackingError, string> = {
  session_expired: "Your session expired. Sign in to save this.",
  not_found: "This movie isn't available to track.",
  tmdb_unavailable: "Couldn't reach TMDB. Try again in a moment.",
  write_failed: "Couldn't save that change. Try again.",
  invalid_input: "Couldn't save that change. Try again.",
  // Only an Undo can be refused this way. The list pages show the copy for the
  // list the movie came from, in `UNDO_EXPIRED_MESSAGES`; this is the fallback.
  undo_expired: "Couldn't undo. Change it again from the movie page.",
  not_released: "This movie hasn't been released yet.",
};

/** The movie copy without the release gate, which episodes and shows lack. */
const { not_released: _movieOnly, ...SHARED_TRACKING_MESSAGES } =
  TRACKING_MESSAGES;

/**
 * The toasts the two private list pages show after a removal (spec 0008,
 * AC-5, AC-7). Unlike the controls above, a removal does confirm itself with a
 * toast, because the card it changed is gone and the toast is where Undo lives.
 */
export const LIBRARY_MESSAGES = {
  watchlist: { removed: "Removed from Watchlist" },
  upcoming: { removed: "Removed from Upcoming" },
  watched: {
    removed: "Removed from Watched",
    scoreKept: "Your score is kept.",
  },
} as const;

/** What a refused Undo says, per list (spec 0008, AC-6, AC-7). */
export const UNDO_EXPIRED_MESSAGES = {
  watchlist: "Couldn't undo. Plan it again from the movie page.",
  upcoming: "Couldn't undo. Plan it again from the movie page.",
  watched: "Couldn't undo. Mark it watched again from the movie page.",
} as const;

/** The label on a removal toast's action. */
export const UNDO_ACTION_LABEL = "Undo";

/** The label on the session expired toast's action. */
export const SIGN_IN_ACTION_LABEL = "Sign in";

/** The line that replaces the controls when the tracking read fails (AC-17). */
export const TRACKING_READ_FAILED = "Couldn't load your tracking.";

/**
 * The episode and season controls' failure copy (spec 0011, AC-7, AC-14): the
 * movie copy, with the two lines that name what could not be tracked, and a
 * refused Undo that points back at the page the person is already on.
 */
export const EPISODE_TRACKING_MESSAGES: Record<EpisodeTrackingError, string> = {
  ...SHARED_TRACKING_MESSAGES,
  not_found: "This episode isn't available to track.",
  not_aired: "This episode hasn't aired yet.",
  undo_expired: "Couldn't undo. Change the episodes again on this page.",
};

/** An episode count in the season toasts: "1 episode", "4 episodes". */
function episodes(n: number): string {
  return `${n} ${n === 1 ? "episode" : "episodes"}`;
}

/**
 * The toasts a season write confirms itself with (spec 0011, AC-10, AC-11).
 * Unlike a single pill, one click here can change dozens of rows, so it says
 * how many and carries the Undo.
 */
export const SEASON_MESSAGES = {
  marked: (n: number) => `Marked ${episodes(n)} watched`,
  nothingToMark: "Every aired episode is already watched",
  unmarked: (n: number) => `Unmarked ${episodes(n)}`,
} as const;

/**
 * The show tracking toggle's copy and toasts (spec 0020, AC-2 to AC-6). Stop
 * tracking, whose toggle goes back to Plan to watch, confirms with a toast
 * that carries the Undo; one that found the show already untracked confirms
 * without it (AC-4). An episode write that tracked the show is announced
 * because the person never chose it.
 */
export const SHOW_TRACKING_COPY = {
  plan: "Plan to watch",
  tracking: "Tracking",
  unavailable: "Tracking unavailable",
  stopLabel: (show: string) => `Stop tracking ${show}`,
  added: (show: string) => `${show} added to your shows`,
  stopped: (show: string) => `Stopped tracking ${show}`,
  undoExpired: "Couldn't undo. Track the show again from its page.",
} as const;

/** The show tracking failure copy: the movie copy, naming a show. */
export const SHOW_TRACKING_MESSAGES: Record<ShowTrackingError, string> = {
  ...SHARED_TRACKING_MESSAGES,
  not_found: "This show isn't available to track.",
  undo_expired: SHOW_TRACKING_COPY.undoExpired,
};

/**
 * The progress line under the show hero's tracking toggle (spec 0013, AC-10,
 * AC-11). Counts only aired regular episodes, so it never says "0%" for a
 * show with nothing aired, and never shows a number from a partial read.
 */
export const SHOW_PROGRESS_MESSAGES = {
  counted: (watched: number, total: number) =>
    `${watched} of ${total} ${total === 1 ? "episode" : "episodes"} watched`,
  noneAired: "No episodes have aired yet",
  unavailable: "Progress unavailable right now",
  barLabel: "Aired episodes watched",
} as const;

/** The Next episode pill on a Watchlist show card (spec 0020, AC-9). */
export const NEXT_EPISODE_MESSAGES = {
  pill: (season: number, episode: number) => `S${season}E${episode}`,
  accessible: (season: number, episode: number) =>
    `Next episode, season ${season} episode ${episode}`,
} as const;

/**
 * A Watchlist show card's Mark watched button and its toasts (spec 0020,
 * AC-9, carrying spec 0014's Up Next behaviour over unchanged).
 */
export const MARK_NEXT_MESSAGES = {
  unavailable: "Next episode unavailable",
  markLabel: (show: string, season: number, episode: number) =>
    `Mark ${show} season ${season} episode ${episode} watched`,
  marked: (show: string, season: number, episode: number) =>
    `Marked ${show} S${season}E${episode} watched`,
  alreadyWatched: (show: string, season: number, episode: number) =>
    `${show} S${season}E${episode} was already watched`,
  undoChanged: "Couldn't undo. This episode changed in another tab.",
} as const;

/** An Upcoming card's date pill (spec 0020, AC-11, AC-13). */
export const UPCOMING_MESSAGES = {
  datedPill: (season: number, episode: number, date: string) =>
    `S${season}E${episode} · ${date}`,
  episodeAirs: (season: number, episode: number, fullDate: string) =>
    `Season ${season} episode ${episode} airs ${fullDate}`,
  dateTba: "Date TBA",
  episodeDateTba: (season: number, episode: number) =>
    `Season ${season} episode ${episode}, date to be announced`,
  showDateTba: "Next episode date to be announced",
  releases: (fullDate: string) => `Releases ${fullDate}`,
  releaseTba: "Release date to be announced",
} as const;

/** What a list page's grid, empty state and notes say (spec 0020, AC-18). */
type ListCopy = {
  grid: string;
  empty: { title: string; description: string };
  browse: string;
};

/**
 * Every piece of copy that differs between the three library pages and their
 * two tabs (spec 0020, AC-12, AC-15, AC-18; feature 22). Each empty state
 * offers the one catalog its tab lists.
 */
export const LIBRARY_COPY: Record<
  "watchlist" | "upcoming" | "watched",
  Record<MediaType, ListCopy> & { failed: string }
> = {
  watchlist: {
    tv: {
      grid: "Shows to watch",
      empty: {
        title: "Nothing to watch right now",
        description:
          "Plan a show or catch up on one and its next episode shows up here.",
      },
      browse: "Browse shows",
    },
    movie: {
      grid: "Movies to watch",
      empty: {
        title: "No movies to watch",
        description: "Planned movies that are already out show up here.",
      },
      browse: "Browse movies",
    },
    failed: "Couldn't load your watchlist",
  },
  upcoming: {
    tv: {
      grid: "Shows coming up",
      empty: {
        title: "Nothing coming up",
        description:
          "Planned shows not out yet, and shows you're caught up on with a dated next episode, show up here.",
      },
      browse: "Browse shows",
    },
    movie: {
      grid: "Movies coming up",
      empty: {
        title: "No upcoming movies",
        description: "Planned movies not released yet show up here.",
      },
      browse: "Browse movies",
    },
    failed: "Couldn't load your upcoming titles",
  },
  watched: {
    tv: {
      grid: "Shows you're caught up on",
      empty: {
        title: "No watched shows yet",
        description: "Shows you're caught up on show up here.",
      },
      browse: "Browse shows",
    },
    movie: {
      grid: "Movies you watched",
      empty: {
        title: "No watched movies yet",
        description: "Movies you mark watched show up here.",
      },
      browse: "Browse movies",
    },
    failed: "Couldn't load your watched titles",
  },
};

/** "1 show", "4 movies". */
function titles(n: number, type: MediaType): string {
  const noun = type === "tv" ? "show" : "movie";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * The notes above a classified tab (spec 0020, AC-16, AC-17): the 500 title
 * ceiling, and the titles whose TMDB read failed, which are on no page.
 */
export const LIBRARY_NOTES = {
  checked: (limit: number, type: MediaType) =>
    `Checked your ${limit} most recent ${type === "tv" ? "shows" : "movies"}`,
  failed: (n: number, type: MediaType) =>
    `${titles(n, type)} couldn't be loaded`,
} as const;

/** The labels a Watched show card carries (spec 0020, AC-12). */
export const WATCHED_SHOW_LABELS = {
  finished: "Finished",
  caught_up: "Caught up",
} as const;

/** A Watchlist show TMDB no longer has (spec 0020, AC-17). */
export const MISSING_SHOW_COPY = {
  /**
   * Stands in for the show's name in the shared toasts, which TMDB no longer
   * gives: "Stopped tracking this show".
   */
  toastName: "this show",
  /** The Stop tracking button's accessible name. */
  stopLabel: "Stop tracking missing title",
} as const;
