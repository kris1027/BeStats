import {
  defaultLibraryType,
  type LibraryList,
  type LibraryPageKey,
  libraryPageName,
} from "../catalog/library-list";
import type { LibraryType } from "../catalog/media-type";

import type {
  EpisodeTrackingError,
  GameStatus,
  GameTrackingError,
  MovieTrackingError,
  ShowTrackingError,
  TrackingError,
} from "./types";

/**
 * The failure copy every tracking control shares, naming a movie; the episode
 * and show maps below override the lines that name what failed.
 */
const SHARED_TRACKING_MESSAGES: Record<TrackingError, string> = {
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
 * Every toast a movie tracking control can show, written once (spec 0007,
 * toast copy): the shared copy plus the release gate, which episodes and
 * shows lack (prompts/movie-release-gate.md).
 *
 * Toasts appear only on failure; a success is shown by the control itself. An
 * invalid input shares the generic copy because it can only come from a bug or
 * a tampered call, and telling the person which field was wrong would not help
 * them.
 */
export const TRACKING_MESSAGES: Record<MovieTrackingError, string> = {
  ...SHARED_TRACKING_MESSAGES,
  not_released: "This movie hasn't been released yet.",
  // Only a stale tab or a crafted call reaches it: the score pill shows only
  // on a watched movie (prompts/movie-plan-watched-exclusive.md).
  not_watched: "Mark it watched before scoring.",
};

/**
 * The toasts a movie write shows when it removed a watch mark, each with an
 * Undo that puts the mark and the score back
 * (prompts/movie-plan-watched-exclusive.md). Unmarking a movie with no score
 * removes nothing else, so it shows no toast.
 */
export const MOVIE_CLEARED_MESSAGES = {
  planned: (hadScore: boolean) =>
    hadScore
      ? "Moved to your plan. Watched mark and score removed."
      : "Moved to your plan. Watched mark removed.",
  unwatched: "Score removed too.",
  undoExpired: "Couldn't undo. Mark it watched again.",
} as const;

/**
 * The toasts the movie tabs of the library pages show after a removal (spec
 * 0008, AC-5, AC-7). Unlike the controls above, a removal does confirm itself
 * with a toast, because the card it changed is gone and the toast is where
 * Undo lives. Each names the page as the movies tab does.
 */
export const LIBRARY_MESSAGES = {
  watchlist: {
    removed: `Removed from ${libraryPageName("watchlist", "movie")}`,
  },
  upcoming: { removed: `Removed from ${libraryPageName("upcoming", "movie")}` },
  watched: {
    removed: `Removed from ${libraryPageName("watched", "movie")}`,
    scoreRemoved: "Your score was removed too.",
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

/**
 * The label on a failed write's toast action when the phone had no
 * connection (spec 0033, AC-13). Beside `UNDO_ACTION_LABEL` because both are
 * tracking toast actions, so the apps never word them apart.
 */
export const RETRY_ACTION_LABEL = "Retry";

/**
 * How long a toast carrying Undo stays up, in milliseconds, in both apps:
 * long enough for a keyboard or screen reader user to reach the action. The
 * server allows 10 minutes, so the toast is the limit (spec 0033, shared
 * contracts: the same rules in one place).
 */
export const UNDO_TOAST_MS = 10_000;

/**
 * The score picker's clear button, the same words in both apps (feature 29,
 * slice 2): the web's score picker and the app's score sheet read it here.
 */
export const CLEAR_RATING_LABEL = "Clear rating";

/** The label on the session expired toast's action. */
export const SIGN_IN_ACTION_LABEL = "Sign in";

/**
 * What a movie with no overview in any language shows (spec 0006, AC-4).
 * Both apps print it, so it lives here rather than in either screen.
 */
export const MOVIE_OVERVIEW_MISSING = "No overview available.";

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
 * The movie pills' visible labels (spec 0007, AC-1). Both apps draw the same
 * pills, so the words live here rather than in either control.
 */
export const MOVIE_TRACKING_LABELS = {
  plan: "Plan",
  planned: "Planned",
  markWatched: "Mark watched",
  watched: "Watched",
} as const;

/**
 * A season page's header and episode rows (spec 0011, AC-2, AC-4, AC-8): the
 * season button, its count, the rating line, the empty season and each row's
 * fallback name, date line and Watched pill. An episode with no TMDB name is
 * called by its number, never by an invented title (`AGENTS.md` section 14).
 */
export const SEASON_PAGE_COPY = {
  markSeason: "Mark season watched",
  seasonWatched: "Season watched",
  nothingAired: "Nothing aired yet",
  watchedCount: (watched: number, aired: number) =>
    `${watched} of ${aired} watched`,
  ratingLabel: "Your season rating",
  noEpisodes: "No episodes listed yet",
  noEpisodesDescription: "TMDB lists no episodes for this season yet.",
  episodeName: (name: string | null, episodeNumber: number) =>
    name ?? `Episode ${episodeNumber}`,
  airDateMissing: "Air date not announced",
  upcoming: "Upcoming",
  airs: (date: string) => `Airs ${date}`,
  markWatched: "Mark watched",
  watched: "Watched",
  /** The app's swipe action on a watched episode (feature 29, slice 2). */
  markUnwatched: "Mark unwatched",
  /**
   * The row's Watched button as a screen reader announces it: what a tap
   * does now, so a watched episode never reads "Mark … watched" while the
   * tap unmarks it (AGENTS.md section 11, no false success).
   */
  toggleWatchedLabel: (episode: string, watched: boolean) =>
    watched ? `Mark ${episode} unwatched` : `Mark ${episode} watched`,
} as const;

/**
 * The toast after a single episode mark this tap made (spec 0035, Undo): it
 * carries the Undo, which clears that mark only while it is still the one
 * the tap stored.
 */
export const EPISODE_MARK_MESSAGES = {
  marked: (episode: string) => `Marked ${episode} watched`,
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

/** The game page's three status pills, in their order (spec 0026, AC-2). */
export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  want_to_play: "Want to play",
  playing: "Playing",
  finished: "Finished",
};

/**
 * What a list page's grid, empty state and notes say (spec 0020, AC-18).
 * `browse` is the empty state's button, leading to the type's landing
 * (spec 0028, AC-17, for the games tabs).
 */
type ListCopy = {
  grid: string;
  empty: { title: string; description: string };
  browse: string;
};

/**
 * Every piece of copy that differs between the three library pages and their
 * tabs (spec 0020, AC-12, AC-15, AC-18; feature 22; spec 0027, AC-14). Each
 * show and movie empty state offers the one catalog its tab lists.
 */
export const LIBRARY_COPY: Record<LibraryList, Record<LibraryType, ListCopy>> &
  Record<"coming-soon", { game: ListCopy }> = {
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
    game: {
      grid: "Games you want to play",
      empty: {
        title: "No games to play yet",
        description: `Released games you mark ${GAME_STATUS_LABELS.want_to_play} show up here.`,
      },
      browse: "Browse games",
    },
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
        title: "Nothing coming soon",
        description: "Planned movies not released yet show up here.",
      },
      browse: "Browse movies",
    },
    game: {
      grid: "Games you're playing",
      empty: {
        title: "Nothing in progress",
        description: "Games you mark Playing show up here.",
      },
      browse: "Browse games",
    },
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
    game: {
      grid: "Games you finished",
      empty: {
        title: "No finished games yet",
        description: "Games you mark Finished show up here.",
      },
      browse: "Browse games",
    },
  },
  // The one page only one tab has (prompts/game-coming-soon.md).
  "coming-soon": {
    game: {
      grid: "Unreleased games you want to play",
      empty: {
        title: "No unreleased games on your list",
        description: `${GAME_STATUS_LABELS.want_to_play} games that aren't out yet show up here.`,
      },
      browse: "Browse games",
    },
  },
};

/**
 * A library page's copy on one tab, Coming soon included. A tab without the
 * page reads the games copy, as its name does (`libraryPageName`).
 */
export function libraryCopy(page: LibraryPageKey, type: LibraryType): ListCopy {
  const copy: Partial<Record<LibraryType, ListCopy>> = LIBRARY_COPY[page];
  return copy[type] ?? libraryCopy(page, defaultLibraryType(page));
}

/**
 * The title of every failed library list. One for all three pages, because
 * the error boundary that also shows it cannot read the tab, and a page's
 * name differs per tab (prompts/library-page-names.md).
 */
export const LIBRARY_LIST_FAILED_TITLE = "Couldn't load your list";

/**
 * The line under every failed library list, beside `LIBRARY_LIST_FAILED_TITLE`:
 * a failed read (`ListFailed`) and a section that threw (`LibraryErrorBoundary`,
 * spec 0027, AC-5) read the same.
 */
export const LIBRARY_LIST_FAILED =
  "Your list didn't load. Try again in a moment.";

/** The month line under a Playing or Finished game card (spec 0027, AC-9). */
export const GAME_DATE_LINES = {
  started: (month: string) => `Started ${month}`,
  finished: (month: string) => `Finished ${month}`,
} as const;

/** Each tab's noun, for the notes' counts. */
const TITLE_NOUNS = { tv: "show", movie: "movie", game: "game" } as const;

/** "1 show", "4 movies", "2 games". */
function titles(n: number, type: LibraryType): string {
  return `${n} ${TITLE_NOUNS[type]}${n === 1 ? "" : "s"}`;
}

/**
 * The notes above a classified tab (spec 0020, AC-16, AC-17): the 500 title
 * ceiling, and the titles whose TMDB read failed, which are on no page.
 */
export const LIBRARY_NOTES = {
  checked: (limit: number, type: LibraryType) =>
    `Checked your ${limit} most recent ${TITLE_NOUNS[type]}s`,
  failed: (n: number, type: LibraryType) =>
    `${titles(n, type)} couldn't be loaded`,
} as const;

/**
 * What a library card says when it has no title to show, and the prefixes
 * that name a personal badge for a screen reader, so the web and the app say
 * the same thing (spec 0008, AC-11; spec 0027, AC-11; AGENTS.md section 9).
 */
export const LIBRARY_CARD_MESSAGES = {
  /** A title the catalog no longer has: "No longer on TMDB". */
  missing: (source: string) => `No longer on ${source}`,
  /** A stored title whose catalog read failed; its history still shows. */
  failed: "Couldn't load this title",
  yourScore: "Your score",
  yourShowRating: "Your show rating",
} as const;

/**
 * The accessible names of a library card's quick action buttons, so the web's
 * cards and the app's say the same thing to a screen reader (AGENTS.md
 * section 3; prompts/mobile-card-quick-actions.md, decision 3). A card with
 * no title to name stands in with `missingTitle` or `missingGame`.
 */
export const LIBRARY_CARD_ACTION_LABELS = {
  missingTitle: "missing title",
  missingGame: "missing game",
  unmarkMovie: (name: string) => `Unmark ${name} as watched`,
  removeFromPage: (name: string, page: LibraryPageKey, type: LibraryType) =>
    `Remove ${name} from ${libraryPageName(page, type)}`,
  removeGame: (name: string) => `Remove ${name} from your games`,
} as const;

/** The signed out library: no private request, only the way in. */
export const LIBRARY_SIGNED_OUT = {
  title: "Sign in to see your library",
  description:
    "Your watchlist, progress and history are private to your account.",
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

/** What a refused game Undo says: change it again on the game page. */
const GAME_UNDO_EXPIRED = "Couldn't undo. Set the status again on this page.";

/**
 * The game status control's failure copy (spec 0026, API surface): the movie
 * copy for the shared classes, with the lines that name a game, IGDB in place
 * of TMDB, and the game's own refusals.
 */
export const GAME_TRACKING_MESSAGES: Record<GameTrackingError, string> = {
  session_expired: SHARED_TRACKING_MESSAGES.session_expired,
  write_failed: SHARED_TRACKING_MESSAGES.write_failed,
  invalid_input: SHARED_TRACKING_MESSAGES.invalid_input,
  not_found: "This game isn't available to track.",
  undo_expired: GAME_UNDO_EXPIRED,
  igdb_unavailable: "Couldn't reach IGDB. Try again.",
  not_released: "This game isn't out yet.",
  // Only a stale tab or a crafted call reaches it: the score pill shows only
  // on Playing or Finished.
  not_started: "Set Playing or Finished to score this game.",
};

/**
 * The two game toasts that carry an Undo (spec 0026, AC-4, AC-5). A status
 * change that removed nothing confirms itself through the pill alone.
 */
export const GAME_UNDO_MESSAGES = {
  removed: "Removed from your games.",
  scoreCleared: "Moved to Want to play. Your score was removed.",
  undoExpired: GAME_UNDO_EXPIRED,
} as const;
