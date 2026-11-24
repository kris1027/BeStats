import type {
  V1GameTitleState,
  V1MovieTitleState,
  V1ShowTitleState,
} from "@bestats/core/api/v1/titles";
import { isGameReleased } from "@bestats/core/catalog/game-page";
import { isMovieReleased } from "@bestats/core/catalog/movie-page";
import { formatPersonalScore } from "@bestats/core/format";
import {
  canHoldScore,
  type GameIntent,
  isGameStatusHeldBack,
} from "@bestats/core/tracking/game-intent";
import { movieTrackingAvailability } from "@bestats/core/tracking/intent";
import {
  CATALOG_CARD_ACTION_LABELS,
  GAME_STATUS_LABELS,
  LIBRARY_CARD_MESSAGES,
  MOVIE_TRACKING_LABELS,
  SHOW_TRACKING_COPY,
} from "@bestats/core/tracking/messages";

import type { MovieWrite } from "./title-writes";

const MENU = CATALOG_CARD_ACTION_LABELS.menu;

/**
 * One action in a catalog card's long press menu
 * (prompts/mobile-look-card-actions.md, decision 2). `id` is stable per
 * action, for the menu's keys and the screen reader's custom actions;
 * `disabled` keeps it visible but off (decision 8); `destructive` marks a
 * removal, which offers Undo.
 */
export type CardMenuItem<TWrite> = {
  id: string;
  title: string;
  destructive: boolean;
  disabled: boolean;
  write: TWrite;
};

/**
 * What a card shows of the user's own state (decision 9), the web card's
 * slots: the green bookmark at the top right, the Watched mark at the bottom
 * right, the cyan score in place of the community pill, and a game's status
 * pill at the bottom. `words` is what a screen reader hears for it.
 */
export type CardMarks = {
  planned: boolean;
  watched: boolean;
  score: number | null;
  pill: string | null;
  words: string[];
};

function scoreWords(score: number | null): string[] {
  return score === null
    ? []
    : [`${LIBRARY_CARD_MESSAGES.yourScore} ${formatPersonalScore(score)}`];
}

/**
 * A movie card's menu: Plan or Remove from plan, then Mark watched or Remove
 * watched mark. A movie is planned or watched, never both, so Plan on a
 * watched movie drops the mark and score with Undo (AGENTS.md section 7).
 * Mark watched follows core's release gate: before the release day (UTC) it
 * stays in the menu but off, unless a mark is already stored, which can be
 * removed. The server checks the gate again.
 */
export function movieCardMenu(
  state: V1MovieTitleState,
  releaseDate: string | null,
  today: string,
): CardMenuItem<MovieWrite>[] {
  const watched = state.watchedAt !== null;
  const { canMark } = movieTrackingAvailability(
    isMovieReleased(releaseDate, today),
    { watched, rating: state.rating },
  );
  return [
    {
      id: "plan",
      title: state.planned ? MENU.unplan : MENU.plan,
      destructive: state.planned,
      disabled: false,
      write: { kind: "watchlist", value: !state.planned, clears: "planned" },
    },
    {
      id: "watched",
      title: watched ? MENU.unmark : MENU.markWatched,
      destructive: watched,
      disabled: !canMark,
      write: watched
        ? { kind: "watched", value: false, clears: "unwatched" }
        : { kind: "watched", value: true },
    },
  ];
}

/** A movie card's marks, read from the same state as the movie screen. */
export function movieCardMarks(state: V1MovieTitleState): CardMarks {
  const watched = state.watchedAt !== null;
  const score = watched ? state.rating : null;
  return {
    planned: state.planned,
    watched,
    score,
    pill: null,
    words: [
      ...(state.planned ? [MOVIE_TRACKING_LABELS.planned] : []),
      ...(watched ? [MOVIE_TRACKING_LABELS.watched] : []),
      ...scoreWords(score),
    ],
  };
}

/**
 * A show card's menu: Track, or Stop tracking, which keeps every mark and
 * rating and offers Undo (AGENTS.md section 7, tracking and history are
 * separate).
 */
export function showCardMenu(state: V1ShowTitleState): CardMenuItem<boolean>[] {
  return [
    {
      id: "tracking",
      title: state.tracked ? MENU.stopTracking : MENU.track,
      destructive: state.tracked,
      disabled: false,
      write: !state.tracked,
    },
  ];
}

/**
 * A show card's marks: the bookmark while tracked. The web's show rating,
 * Upcoming pill and Finished line need the library page placement, which the
 * v1 title state does not carry and the app may not work out itself, so
 * they stay off the app's cards (decision 9).
 */
export function showCardMarks(state: V1ShowTitleState): CardMarks {
  return {
    planned: state.tracked,
    watched: false,
    score: null,
    pill: null,
    words: state.tracked ? [SHOW_TRACKING_COPY.tracking] : [],
  };
}

/**
 * A game card's menu, the web's bookmark: Want to play on a game not in the
 * list, and Remove from your games on one that is, whatever its status,
 * with Undo. Want to play is never held back by the release gate; if core
 * ever holds it back, it shows off rather than vanishing.
 */
export function gameCardMenu(
  state: V1GameTitleState,
  releaseDate: string | null,
  today: string,
): CardMenuItem<GameIntent>[] {
  if (state.status !== null) {
    return [
      {
        id: "status",
        title: MENU.removeGame,
        destructive: true,
        disabled: false,
        write: { kind: "status", value: null },
      },
    ];
  }
  return [
    {
      id: "status",
      title: MENU.wantToPlay,
      destructive: false,
      disabled: isGameStatusHeldBack(
        isGameReleased(releaseDate, today),
        null,
        "want_to_play",
      ),
      write: { kind: "status", value: "want_to_play" },
    },
  ];
}

/**
 * A game card's marks: the bookmark on Want to play; on Playing or Finished
 * the status pill and, when scored, the cyan score.
 */
export function gameCardMarks(state: V1GameTitleState): CardMarks {
  const started = canHoldScore(state.status);
  const score = started ? state.rating : null;
  const pill =
    started && state.status !== null ? GAME_STATUS_LABELS[state.status] : null;
  return {
    planned: state.status === "want_to_play",
    watched: false,
    score,
    pill,
    words: [
      ...(state.status === "want_to_play"
        ? [GAME_STATUS_LABELS.want_to_play]
        : []),
      ...(pill ? [pill] : []),
      ...scoreWords(score),
    ],
  };
}
