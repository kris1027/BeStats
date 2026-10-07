import type {
  EpisodeTrackingError,
  MovieTrackingError,
  ShowStatusError,
  TvStatus,
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
};

/**
 * The toasts the two private list pages show after a removal (spec 0008,
 * AC-5, AC-7). Unlike the controls above, a removal does confirm itself with a
 * toast, because the card it changed is gone and the toast is where Undo lives.
 */
export const LIBRARY_MESSAGES = {
  watchlist: { removed: "Removed from Watchlist" },
  watched: {
    removed: "Removed from Watched",
    scoreKept: "Your score is kept.",
  },
} as const;

/** What a refused Undo says, per list (spec 0008, AC-6, AC-7). */
export const UNDO_EXPIRED_MESSAGES = {
  watchlist: "Couldn't undo. Plan it again from the movie page.",
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
  ...TRACKING_MESSAGES,
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
  /** The mark also completed the show (spec 0015, AC-5). */
  markedCompleted: (n: number, show: string) =>
    `Marked ${episodes(n)} watched · ${show} moved to Completed`,
  nothingToMark: "Every aired episode is already watched",
  unmarked: (n: number) => `Unmarked ${episodes(n)}`,
} as const;

/** The status names every TV surface shows (spec 0013, AC-1). */
export const TV_STATUS_LABELS: Record<TvStatus, string> = {
  want_to_watch: "Want to Watch",
  watching: "Watching",
  on_hold: "On Hold",
  dropped: "Dropped",
  completed: "Completed",
};

/**
 * The show status control's copy and toasts (spec 0013, AC-1, AC-4, AC-5,
 * AC-8, AC-16). A status change shows itself on the pill; only a removal or
 * a Stop watching, whose card or label is gone, confirms with a toast, and
 * that toast carries the Undo. The automatic moves to Watching and to
 * Completed (spec 0015, AC-5) are announced because the person never chose
 * them.
 */
export const SHOW_STATUS_MESSAGES = {
  untracked: "Add to my shows",
  unavailable: "Status unavailable",
  remove: "Remove status",
  menuLabel: "Show status",
  removed: (show: string) => `Removed ${show} from your shows`,
  stopped: (show: string) => `${show} moved to On Hold`,
  started: (show: string) => `${show} moved to Watching`,
  /** An episode write completed the show (spec 0015, AC-5). */
  completed: (show: string) => `${show} moved to Completed`,
  undoExpired: "Couldn't undo. Change the status from the show page.",
} as const;

/** The show status failure copy: the movie copy, naming a show. */
export const SHOW_TRACKING_MESSAGES: Record<ShowStatusError, string> = {
  ...TRACKING_MESSAGES,
  not_found: "This show isn't available to track.",
  undo_expired: SHOW_STATUS_MESSAGES.undoExpired,
  status_changed:
    "This show's status changed elsewhere. Showing the current one.",
};

/**
 * The progress line under the show hero's status pill (spec 0013, AC-10,
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

/** The Next episode pill on a watchlist TV card (spec 0013, AC-15). */
export const NEXT_EPISODE_MESSAGES = {
  upToDate: "Up to date",
  pill: (season: number, episode: number) => `S${season}E${episode}`,
  accessible: (season: number, episode: number) =>
    `Next episode, season ${season} episode ${episode}`,
} as const;

/**
 * The Up Next section of `/upcoming` (spec 0014, AC-5, AC-7 to AC-9, AC-13,
 * AC-14). The caught up caption is the `AGENTS.md` section 9 wording.
 */
export const UP_NEXT_MESSAGES = {
  heading: "Up Next",
  gridLabel: "Shows you're watching",
  caughtUp: "You're up to date",
  datedPill: (season: number, episode: number, date: string) =>
    `S${season}E${episode} · ${date}`,
  nextAirs: (season: number, episode: number, fullDate: string) =>
    `Next episode, season ${season} episode ${episode}, airs ${fullDate}`,
  firstAirs: (season: number, episode: number, fullDate: string) =>
    `Season ${season} episode ${episode} airs ${fullDate}`,
  unavailable: "Next episode unavailable",
  markLabel: (show: string, season: number, episode: number) =>
    `Mark ${show} season ${season} episode ${episode} watched`,
  marked: (show: string, season: number, episode: number) =>
    `Marked ${show} S${season}E${episode} watched`,
  /** The mark also completed the show (spec 0015, AC-5). */
  markedCompleted: (show: string, season: number, episode: number) =>
    `Marked ${show} S${season}E${episode} watched · Moved to Completed`,
  alreadyWatched: (show: string, season: number, episode: number) =>
    `${show} S${season}E${episode} was already watched`,
  undoChanged: "Couldn't undo. This episode changed in another tab.",
  empty: "Start watching a show and its next episode shows up here.",
  browse: "Browse shows",
  failed: "Couldn't load your shows. Try again in a moment.",
} as const;

/** The Coming soon section of `/upcoming` (spec 0014, AC-11 to AC-14). */
export const COMING_SOON_MESSAGES = {
  heading: "Coming soon",
  gridLabel: "Planned movies coming soon",
  releases: (fullDate: string) => `Releases ${fullDate}`,
  remove: (title: string) => `Remove ${title} from watchlist`,
  checkedLimit: (limit: number) =>
    `Checked your ${limit} most recently planned movies`,
  empty: "No planned movies are waiting for release.",
  browse: "Browse movies",
  failed: "Couldn't load your planned movies. Try again in a moment.",
} as const;
